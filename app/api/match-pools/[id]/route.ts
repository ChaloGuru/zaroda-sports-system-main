import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";

export const dynamic = "force-dynamic";

const matchPoolUpdateSchema = z.object({
  teamAScore: z.number().int().min(0).nullable().optional(),
  teamBScore: z.number().int().min(0).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const existing = await prisma.matchPool.findUnique({ where: { id: params.id }, include: { game: true } });
    if (!existing) return NextResponse.json({ error: "Fixture not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(existing.game.championshipId, ["TOURNAMENT_ADMIN", "SCOREKEEPER"]);

    const body: unknown = await request.json();
    const input = matchPoolUpdateSchema.parse(body);

    const teamAScore = input.teamAScore ?? existing.teamAScore;
    const teamBScore = input.teamBScore ?? existing.teamBScore;
    let winnerId: string | null = existing.winnerId;
    if (teamAScore !== null && teamBScore !== null) {
      if (teamAScore > teamBScore) winnerId = existing.teamAId;
      else if (teamBScore > teamAScore) winnerId = existing.teamBId;
      else winnerId = null; // draw
    }

    const updated = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "match_pools",
      oldData: existing,
      mutate: (tx) =>
        tx.matchPool.update({
          where: { id: params.id },
          data: { teamAScore: input.teamAScore, teamBScore: input.teamBScore, notes: input.notes, winnerId },
        }),
      recordId: () => params.id,
      newData: input,
    });

    return NextResponse.json({ matchPool: updated });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const existing = await prisma.matchPool.findUnique({ where: { id: params.id }, include: { game: true } });
    if (!existing) return NextResponse.json({ error: "Fixture not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(existing.game.championshipId, ["TOURNAMENT_ADMIN"]);

    await withAudit({
      actorId: ctx.userId,
      operation: "DELETE",
      tableName: "match_pools",
      oldData: existing,
      mutate: (tx) => tx.matchPool.delete({ where: { id: params.id } }),
      recordId: () => params.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
