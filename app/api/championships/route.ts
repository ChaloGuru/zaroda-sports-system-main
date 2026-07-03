import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import {
  getAuthContext,
  isSuperAdmin,
  hasRole,
  requireActiveSubscriptionForLevel,
  toErrorResponse,
  AuthorizationError,
} from "@/lib/authorize";
import { championshipCreateSchema } from "@/lib/validations";
import { PRIMARY_JS_BALL_GAMES_TEMPLATE } from "@/lib/default-games";
import { withLevelInName } from "@/lib/utils";

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
    const ctx = await getAuthContext();

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (county) where.county = county;

    if (!ctx) {
      where.isPublished = true;
    } else if (isSuperAdmin(ctx)) {
      // no extra restriction
    } else if (hasRole(ctx, "TENANT_OWNER") && ctx.tenantId) {
      where.OR = [{ isPublished: true }, { tenantId: ctx.tenantId }];
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
    if (!isSuperAdmin(ctx)) {
      if (!effectiveTenantId) throw new AuthorizationError("No tenant associated with this account");
      await requireActiveSubscriptionForLevel(effectiveTenantId, input.level);
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
      mutate: (tx) =>
        tx.championship.create({
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
        }),
      recordId: (result) => result.id,
      newData: input,
    });

    // Primary/JS ball-games championships all run the same standard event
    // roster - seed it automatically so tenants only need to add teams.
    // The Games tab still allows editing/adding/removing any of these.
    if (championship.schoolLevel === "PRIMARY_JS" && championship.category === "BALL_GAMES") {
      const gamesToCreate = PRIMARY_JS_BALL_GAMES_TEMPLATE.map((g) => ({
        championshipId: championship.id,
        name: g.name,
        category: "BALL_GAMES" as const,
        gender: g.gender,
        schoolLevel: g.schoolLevel,
        isTimed: false,
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
