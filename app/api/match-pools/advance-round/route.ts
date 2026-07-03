import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { advanceRoundSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

/** Picks a sensible name for the round created from `winnerCount` winners. */
function nextRoundName(currentRoundName: string, winnerCount: number): string {
  const matchCount = winnerCount / 2;
  if (matchCount === 1) return "Final";
  if (matchCount === 2) return "Semifinal";
  if (matchCount === 4) return "Quarterfinal";
  if (matchCount === 8) return "Round of 16";

  const numberMatch = currentRoundName.match(/(\d+)\s*$/);
  if (numberMatch) {
    const nextNumber = Number(numberMatch[1]) + 1;
    return currentRoundName.replace(/\d+\s*$/, String(nextNumber));
  }
  return "Round 2";
}

/**
 * Single-elimination bracket progression: once every fixture in a knockout
 * round has a decisive winner, pairs those winners up in the same order the
 * round's fixtures were created (so bracket position is preserved) and
 * creates the next round's fixtures automatically - no manual re-typing of
 * "who won Round 1" into "who plays in Round 2".
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const input = advanceRoundSchema.parse(body);

    const game = await prisma.game.findUnique({ where: { id: input.gameId } });
    if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(game.championshipId, ["TOURNAMENT_ADMIN", "SCOREKEEPER", "GAME_COORDINATOR"]);

    const fixtures = await prisma.matchPool.findMany({
      where: { gameId: input.gameId, poolId: null, roundName: input.roundName },
      orderBy: { createdAt: "asc" },
    });
    if (fixtures.length === 0) {
      return NextResponse.json({ error: `No fixtures found for round "${input.roundName}"` }, { status: 404 });
    }

    const undecided = fixtures.filter((f) => !f.winnerId);
    if (undecided.length > 0) {
      return NextResponse.json(
        { error: `${undecided.length} match${undecided.length === 1 ? "" : "es"} in this round still need a decisive score (no ties) before advancing` },
        { status: 400 },
      );
    }

    const winners = fixtures.map((f) => f.winnerId as string);
    if (winners.length < 2) {
      return NextResponse.json({ error: "This round only has one match - there's no next round to create" }, { status: 400 });
    }
    if (winners.length % 2 !== 0) {
      return NextResponse.json(
        {
          error:
            "This round has an odd number of winners, so they can't be auto-paired. Add or resolve a bye match manually, then advance again.",
        },
        { status: 400 },
      );
    }

    const existing = await prisma.matchPool.findMany({
      where: { gameId: input.gameId },
      select: { teamAId: true, teamBId: true },
    });
    const existingPairs = new Set(existing.map((mp) => [mp.teamAId, mp.teamBId].sort().join("::")));

    const roundName = nextRoundName(input.roundName, winners.length);
    const rowsToCreate: { gameId: string; poolId: null; roundName: string; teamAId: string; teamBId: string }[] = [];
    for (let i = 0; i < winners.length; i += 2) {
      const teamAId = winners[i] as string;
      const teamBId = winners[i + 1] as string;
      if (existingPairs.has([teamAId, teamBId].sort().join("::"))) continue;
      rowsToCreate.push({ gameId: input.gameId, poolId: null, roundName, teamAId, teamBId });
    }

    if (rowsToCreate.length === 0) {
      return NextResponse.json({ created: 0, roundName });
    }

    const result = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "match_pools",
      mutate: (tx) => tx.matchPool.createMany({ data: rowsToCreate }),
      recordId: () => input.gameId,
      newData: { fromRound: input.roundName, roundName, createdCount: rowsToCreate.length },
    });

    return NextResponse.json({ created: result.count, roundName });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
