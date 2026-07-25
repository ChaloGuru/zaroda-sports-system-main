import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { roleUpdateSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

/** Edits an existing role assignment's role/scope - never the user it's attached to. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const existing = await prisma.userRole.findUnique({ where: { id: params.id } });
    if (!existing || !existing.championshipId) return NextResponse.json({ error: "Role assignment not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(existing.championshipId);
    const body: unknown = await request.json();
    const input = roleUpdateSchema.parse(body);

    const updated = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "user_roles",
      oldData: existing,
      mutate: (tx) =>
        tx.userRole.update({
          where: { id: params.id },
          data: {
            role: input.role,
            organizationName: input.role === "TEAM_MANAGER" ? input.organizationName : null,
            gameCategory: input.gameCategory ?? null,
            ballSport: input.gameCategory === "BALL_GAMES" ? (input.ballSport ?? null) : null,
            athleticsType: input.gameCategory === "ATHLETICS" ? (input.athleticsType ?? null) : null,
          },
        }),
      recordId: () => params.id,
      newData: input,
    });

    return NextResponse.json({ role: updated });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const existing = await prisma.userRole.findUnique({ where: { id: params.id } });
    if (!existing || !existing.championshipId) return NextResponse.json({ error: "Role assignment not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(existing.championshipId);

    await withAudit({
      actorId: ctx.userId,
      operation: "DELETE",
      tableName: "user_roles",
      oldData: existing,
      mutate: (tx) => tx.userRole.delete({ where: { id: params.id } }),
      recordId: () => params.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
