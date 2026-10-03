import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { createSetupToken, setupEmail, setupUrl, unusablePasswordHash } from "@/lib/account-setup";
import { sendEmail } from "@/lib/email";
import { isSuperAdmin, requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { roleAssignmentSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

/** "CHIEF_TRACK_JUDGE" -> "Chief Track Judge" */
function roleLabel(role: string): string {
  return role.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Creates (or reuses) a User account and assigns them a championship-scoped
 * role (TOURNAMENT_ADMIN/SCOREKEEPER/OFFICIAL). Callable by SUPER_ADMIN or
 * the TENANT_OWNER of the championship's tenant.
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const input = roleAssignmentSchema.parse(body);
    // Only admins of the championship (not scorekeepers/officials) may hand
    // out roles - otherwise any official could promote themselves.
    const ctx = await requireChampionshipAccess(input.championshipId, ["TOURNAMENT_ADMIN"]);

    let userId = input.userId ?? null;
    let newAccount = false;
    let setupLink: string | null = null;

    if (!userId) {
      if (!input.email) throw new Error("email is required to create a new user");
      const existingUser = await prisma.user.findUnique({ where: { email: input.email.toLowerCase().trim() } });
      if (existingUser) {
        userId = existingUser.id;
        // Let the admin fill in/correct the official's name and phone even
        // when reusing an existing account - only touches fields actually
        // provided on this assignment, and only for accounts that are purely
        // officials within this same tenant's championships (never a tenant
        // owner, super admin, or another tenant's official).
        const championship = await prisma.championship.findUniqueOrThrow({
          where: { id: input.championshipId },
          select: { tenantId: true },
        });
        const rolesOutsideTenant = await prisma.userRole.count({
          where: {
            userId: existingUser.id,
            OR: [{ championshipId: null }, { championship: { tenantId: { not: championship.tenantId } } }],
          },
        });
        const ownsATenant = await prisma.tenant.count({ where: { userId: existingUser.id } });
        if ((input.name || input.phone) && rolesOutsideTenant === 0 && ownsATenant === 0) {
          await prisma.user.update({
            where: { id: existingUser.id },
            data: { ...(input.name ? { name: input.name } : {}), ...(input.phone ? { phone: input.phone } : {}) },
          });
        }
      } else {
        if (!input.name) throw new Error("name is required to add a new official/admin");
        // The admin never sets the password - see lib/account-setup.ts. The
        // new official chooses it from the emailed link.
        const created = await prisma.user.create({
          data: {
            email: input.email.toLowerCase().trim(),
            passwordHash: await unusablePasswordHash(),
            name: input.name,
            phone: input.phone || null,
          },
        });
        const championship = await prisma.championship.findUniqueOrThrow({
          where: { id: input.championshipId },
          select: { name: true },
        });
        const url = setupUrl(createSetupToken(created));
        const email = await sendEmail({
          to: created.email,
          ...setupEmail({ name: created.name, roleLabel: roleLabel(input.role), championshipName: championship.name, url }),
        });
        if (!email.sent) {
          // Only a super admin may be handed the link to pass on - anyone
          // else holding it could take over the account they just created.
          if (!isSuperAdmin(ctx)) {
            await prisma.user.delete({ where: { id: created.id } });
            throw new Error(`Couldn't email ${created.email} their setup link (${email.error ?? "unknown error"}). No account was created - please try again.`);
          }
          setupLink = url;
        }
        userId = created.id;
        newAccount = true;
      }
    }

    const role = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "user_roles",
      mutate: (tx) =>
        tx.userRole.create({
          data: {
            userId: userId as string,
            role: input.role,
            championshipId: input.championshipId,
            organizationName: input.role === "TEAM_MANAGER" ? input.organizationName : null,
            gameCategory: input.gameCategory ?? null,
            ballSport: input.gameCategory === "BALL_GAMES" ? (input.ballSport ?? null) : null,
            athleticsType: input.gameCategory === "ATHLETICS" ? (input.athleticsType ?? null) : null,
          },
        }),
      recordId: (result) => result.id,
      newData: { ...input, newAccount },
    });

    return NextResponse.json({ role, newAccount, setupLink }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const championshipId = searchParams.get("championshipId");
    if (!championshipId) return NextResponse.json({ error: "championshipId is required" }, { status: 400 });

    await requireChampionshipAccess(championshipId, ["TOURNAMENT_ADMIN"]);

    const roles = await prisma.userRole.findMany({
      where: { championshipId },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
    });

    return NextResponse.json({ roles });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
