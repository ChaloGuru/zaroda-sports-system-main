import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { getAuthContext, isSuperAdmin, hasRole, requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { gameCreateSchema } from "@/lib/validations";

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

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const game = await loadGame(params.id);
    if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

    if (!game.championship.isPublished) {
      const ctx = await getAuthContext();
      const owns = ctx && (isSuperAdmin(ctx) || (hasRole(ctx, "TENANT_OWNER") && ctx.tenantId === game.championship.tenantId));
      if (!owns) return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    return NextResponse.json({ game });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const existing = await prisma.game.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Game not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(existing.championshipId, ["TOURNAMENT_ADMIN"]);
    const body: unknown = await request.json();
    const input = gameCreateSchema.partial().parse(body);

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

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
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
