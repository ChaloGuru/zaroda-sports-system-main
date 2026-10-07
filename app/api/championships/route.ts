import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import {
  getAuthContext,
  isSuperAdmin,
  hasRole,
  requireUnusedSubscriptionForLevel,
  toErrorResponse,
  AuthorizationError,
} from "@/lib/authorize";
import { championshipCreateSchema } from "@/lib/validations";
import { defaultGamesFor } from "@/lib/default-games";
import { withLevelInName, todayUtcRange } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Public callers only ever see published championships. Authenticated
 * tenant owners additionally see their own tenant's unpublished ones; super
 * admins see everything. The client cannot widen this by query params.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const county = searchParams.get("county");
    const ongoing = searchParams.get("ongoing") === "true";
    const upcoming = searchParams.get("upcoming") === "true";
    // Set by callers that are picking one of the caller's OWN championships
    // (e.g. the Roles & Officials assignment picker) - excludes every other
    // tenant's published championships, which the public-discovery default
    // below deliberately includes.
    const mine = searchParams.get("mine") === "true";
    const ctx = await getAuthContext();

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (county) where.county = county;
    if (ongoing) {
      const { startOfTodayUtc, startOfTomorrowUtc } = todayUtcRange();
      where.startDate = { lt: startOfTomorrowUtc };
      where.endDate = { gte: startOfTodayUtc };
    } else if (upcoming) {
      // Starts on some future UTC day - i.e. not today or earlier, so this
      // never overlaps with the "ongoing" set above.
      const { startOfTomorrowUtc } = todayUtcRange();
      where.startDate = { gte: startOfTomorrowUtc };
    }

    if (!ctx) {
      where.isPublished = true;
    } else if (isSuperAdmin(ctx)) {
      // no extra restriction
    } else if (hasRole(ctx, "TENANT_OWNER") && ctx.tenantId) {
      if (mine) {
        where.tenantId = ctx.tenantId;
      } else {
        where.OR = [{ isPublished: true }, { tenantId: ctx.tenantId }];
      }
    } else {
      where.isPublished = true;
    }

    const championships = await prisma.championship.findMany({
      where,
      orderBy: { startDate: "desc" },
      include: { tenant: { select: { organizationName: true, accountType: true } } },
    });

    return NextResponse.json({ championships });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) throw new AuthorizationError("Authentication required", 401);
    if (!isSuperAdmin(ctx) && !hasRole(ctx, "TENANT_OWNER")) {
      throw new AuthorizationError("Only a tenant owner or super admin can create championships");
    }

    const rawBody: unknown = await request.json();
    const input = championshipCreateSchema.parse(rawBody);
    const requestedTenantId =
      typeof (rawBody as { tenantId?: unknown })?.tenantId === "string"
        ? (rawBody as { tenantId: string }).tenantId
        : null;

    let effectiveTenantId = ctx.tenantId;
    let subscription: { id: string } | null = null;
    if (!isSuperAdmin(ctx)) {
      if (!effectiveTenantId) throw new AuthorizationError("No tenant associated with this account");
      subscription = await requireUnusedSubscriptionForLevel(effectiveTenantId, input.level);
    } else {
      if (!requestedTenantId) {
        throw new AuthorizationError("tenantId is required when a super admin creates a championship on behalf of a tenant", 400);
      }
      effectiveTenantId = requestedTenantId;
    }

    const championship = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "championships",
      mutate: async (tx) => {
        const created = await tx.championship.create({
          data: {
            tenantId: effectiveTenantId,
            name: withLevelInName(input.name, input.level),
            level: input.level,
            schoolLevel: input.schoolLevel,
            category: input.category,
            county: input.county,
            location: input.location,
            startDate: input.startDate,
            endDate: input.endDate,
            isPublished: input.isPublished,
            createdBy: ctx.userId,
          },
        });
        // The paid subscription now belongs to this championship - only one
        // championship can claim it, even if two are created at once.
        if (subscription) {
          const claimed = await tx.championshipSubscription.updateMany({
            where: { id: subscription.id, championshipId: null },
            data: { championshipId: created.id },
          });
          if (claimed.count !== 1) {
            throw new AuthorizationError("That subscription was just used for another championship - pay for another to create this one", 409);
          }
        }
        return created;
      },
      recordId: (result) => result.id,
      newData: input,
    });

    // Primary/JS ball-games and athletics championships each run a standard
    // event roster - seed it automatically so tenants only need to add
    // teams/athletes. The Games tab lets admins deactivate, edit or delete
    // any of these they don't run.
    const template = defaultGamesFor(championship);
    if (template.length > 0) {
      const gamesToCreate = template.map((g) => ({
        championshipId: championship.id,
        name: g.name,
        category: g.category,
        gender: g.gender,
        schoolLevel: g.schoolLevel,
        isTimed: g.isTimed,
        sport: g.sport,
      }));

      await withAudit({
        actorId: ctx.userId,
        operation: "INSERT",
        tableName: "games",
        oldData: undefined,
        mutate: (tx) => tx.game.createMany({ data: gamesToCreate }),
        recordId: () => championship.id,
        newData: gamesToCreate,
      });
    }

    return NextResponse.json({ championship }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
