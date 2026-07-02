import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { roleAssignmentSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

/**
 * Creates (or reuses) a User account and assigns them a championship-scoped
 * role (TOURNAMENT_ADMIN/SCOREKEEPER/OFFICIAL). Callable by SUPER_ADMIN or
 * the TENANT_OWNER of the championship's tenant.
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const input = roleAssignmentSchema.parse(body);
    const ctx = await requireChampionshipAccess(input.championshipId);

    let userId = input.userId ?? null;

    if (!userId) {
      if (!input.email) throw new Error("email is required to create a new user");
      const existingUser = await prisma.user.findUnique({ where: { email: input.email.toLowerCase().trim() } });
      if (existingUser) {
        userId = existingUser.id;
      } else {
        if (!input.password || !input.name) {
          throw new Error("name and password are required to create a new official/admin account");
        }
        const passwordHash = await bcrypt.hash(input.password, 12);
        const created = await prisma.user.create({
          data: { email: input.email.toLowerCase().trim(), passwordHash, name: input.name },
        });
        userId = created.id;
      }
    }

    const role = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "user_roles",
      mutate: (tx) =>
        tx.userRole.create({
          data: { userId: userId as string, role: input.role, championshipId: input.championshipId },
        }),
      recordId: (result) => result.id,
      newData: input,
    });

    return NextResponse.json({ role }, { status: 201 });
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

    await requireChampionshipAccess(championshipId);

    const roles = await prisma.userRole.findMany({
      where: { championshipId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    return NextResponse.json({ roles });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
