import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";

export const dynamic = "force-dynamic";

const matchPoolUpdateSchema = z.object({
  matchDate: z.coerce.date().nullable().optional(),
  teamAScore: z.number().int().min(0).nullable().optional(),
  teamBScore: z.number().int().min(0).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  // Marks the fixture as decided by one team failing to turn up. When true,
  // walkoverWinnerId (one of the fixture's two teams) is required and any
  // scoreline is cleared; when false, reverts to a normal scored fixture.
  isWalkover: z.boolean().optional(),
  walkoverWinnerId: z.string().uuid().nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const existing = await prisma.matchPool.findUnique({ where: { id: params.id }, include: { game: true } });
    if (!existing) return NextResponse.json({ error: "Fixture not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(existing.game.championshipId, ["TOURNAMENT_ADMIN", "SCOREKEEPER", "GAME_COORDINATOR"]);

    const body: unknown = await request.json();
    const input = matchPoolUpdateSchema.parse(body);

    let isWalkover = existing.isWalkover;
    let winnerId: string | null = existing.winnerId;
    let teamAScore = existing.teamAScore;
    let teamBScore = existing.teamBScore;

    if (input.isWalkover === true) {
      if (input.walkoverWinnerId !== existing.teamAId && input.walkoverWinnerId !== existing.teamBId) {
        return NextResponse.json({ error: "walkoverWinnerId must be one of this fixture's two teams" }, { status: 400 });
      }
      isWalkover = true;
      winnerId = input.walkoverWinnerId;
      teamAScore = null;
      teamBScore = null;
    } else {
      if (input.isWalkover === false) isWalkover = false;
      teamAScore = input.teamAScore ?? teamAScore;
      teamBScore = input.teamBScore ?? teamBScore;
      if (teamAScore !== null && teamBScore !== null) {
        if (teamAScore > teamBScore) winnerId = existing.teamAId;
        else if (teamBScore > teamAScore) winnerId = existing.teamBId;
        else winnerId = null; // draw
      }
    }

    const updated = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "match_pools",
      oldData: existing,
      mutate: (tx) =>
        tx.matchPool.update({
          where: { id: params.id },
          data: {
            teamAScore,
            teamBScore,
            notes: input.notes,
            winnerId,
            isWalkover,
            ...(input.matchDate !== undefined ? { matchDate: input.matchDate } : {}),
          },
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
