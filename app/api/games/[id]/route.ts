import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { getAuthContext, canViewChampionshipPrivateData, isSuperAdmin, hasRole, requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { gameUpdateSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

async function loadGame(id: string) {
  return prisma.game.findUnique({
    where: { id },
    include: {
      championship: { select: { id: true, name: true, tenantId: true, isPublished: true, category: true } },
      participants: {
        orderBy: [{ position: "asc" }, { bibNumber: "asc" }],
        include: { school: { select: { name: true } }, tournamentTeam: { select: { name: true } } },
      },
      heats: {
        orderBy: { heatNumber: "asc" },
        include: {
          participants: {
            orderBy: [{ position: "asc" }, { laneNumber: "asc" }],
            include: { participant: { select: { firstName: true, lastName: true, bibNumber: true } } },
          },
        },
      },
      matchPools: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const game = await loadGame(params.id);
    if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

    const ctx = await getAuthContext();
    if (!game.championship.isPublished) {
      const owns = ctx && (isSuperAdmin(ctx) || (hasRole(ctx, "TENANT_OWNER") && ctx.tenantId === game.championship.tenantId));
      if (!owns) return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    if (canViewChampionshipPrivateData(ctx, game.championship)) return NextResponse.json({ game });
    // Deactivated games are invisible outside the championship's own staff.
    if (!game.isActive) return NextResponse.json({ error: "Game not found" }, { status: 404 });
    // Public view: no participant dates of birth or internal notes.
    return NextResponse.json({
      game: { ...game, participants: game.participants.map(({ dateOfBirth: _dob, notes: _notes, ...rest }) => rest) },
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const existing = await prisma.game.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Game not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(existing.championshipId, ["TOURNAMENT_ADMIN"]);
    const body: unknown = await request.json();
    const input = gameUpdateSchema.parse(body);

    const updated = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "games",
      oldData: existing,
      mutate: (tx) => tx.game.update({ where: { id: params.id }, data: input }),
      recordId: () => params.id,
      newData: input,
    });

    return NextResponse.json({ game: updated });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const existing = await prisma.game.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Game not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(existing.championshipId, ["TOURNAMENT_ADMIN"]);

    await withAudit({
      actorId: ctx.userId,
      operation: "DELETE",
      tableName: "games",
      oldData: existing,
      mutate: (tx) => tx.game.delete({ where: { id: params.id } }),
      recordId: () => params.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
