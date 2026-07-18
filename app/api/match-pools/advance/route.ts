import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { advanceTopTeamsSchema } from "@/lib/validations";
import { computeStandings, generateRoundRobinSchedule, type MatchResult, type WalkoverResult } from "@/lib/scoring";
import { distributeMatchDatesFromEnd } from "@/lib/match-day";

export const dynamic = "force-dynamic";

/**
 * Automatic pool -> knockout progression. For every pool in the game, ranks
 * its teams by the same standings computation used everywhere else
 * (lib/scoring.ts's computeStandings - points, then head-to-head/goal
 * difference tiebreakers), takes the top `topPerPool` teams from each pool,
 * and schedules a knockout-stage round robin among just the advancers -
 * removing the need to manually pick and pair teams once pool play ends.
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const input = advanceTopTeamsSchema.parse(body);

    const game = await prisma.game.findUnique({
      where: { id: input.gameId },
      include: { championship: { select: { startDate: true, endDate: true } } },
    });
    if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
    if (!game.sport) return NextResponse.json({ error: "This game has no sport set - standings can't be computed" }, { status: 400 });

    const ctx = await requireChampionshipAccess(game.championshipId, ["TOURNAMENT_ADMIN", "SCOREKEEPER", "GAME_COORDINATOR"]);

    const pools = await prisma.pool.findMany({
      where: { gameId: input.gameId },
      include: { teams: { select: { id: true } } },
    });
    if (pools.length === 0) {
      return NextResponse.json({ error: "This game has no pools to advance teams from" }, { status: 400 });
    }

    const allMatchPools = await prisma.matchPool.findMany({
      where: { gameId: input.gameId, poolId: { not: null } },
      select: { poolId: true, teamAId: true, teamBId: true, teamAScore: true, teamBScore: true, isWalkover: true, winnerId: true },
    });

    const advancingTeamIds: string[] = [];
    for (const pool of pools) {
      const teamIds = pool.teams.map((t) => t.id);
      if (teamIds.length === 0) continue;

      const poolMatchPools = allMatchPools.filter((mp) => mp.poolId === pool.id);
      const results: MatchResult[] = poolMatchPools
        .filter((mp) => !mp.isWalkover && mp.teamAScore !== null && mp.teamBScore !== null)
        .map((mp) => ({ teamAId: mp.teamAId, teamBId: mp.teamBId, teamAScore: mp.teamAScore as number, teamBScore: mp.teamBScore as number }));
      const walkovers: WalkoverResult[] = poolMatchPools
        .filter((mp) => mp.isWalkover && mp.winnerId !== null)
        .map((mp) => ({ teamAId: mp.teamAId, teamBId: mp.teamBId, winnerId: mp.winnerId as string }));

      const standings = computeStandings(teamIds, results, game.sport, walkovers);
      advancingTeamIds.push(...standings.slice(0, input.topPerPool).map((row) => row.teamId));
    }

    if (advancingTeamIds.length < 2) {
      return NextResponse.json({ error: "Not enough advancing teams to schedule a knockout round" }, { status: 400 });
    }

    const existing = await prisma.matchPool.findMany({
      where: { gameId: input.gameId },
      select: { teamAId: true, teamBId: true },
    });
    const existingPairs = new Set(existing.map((mp) => [mp.teamAId, mp.teamBId].sort().join("::")));

    const schedule = generateRoundRobinSchedule(advancingTeamIds);
    const matchDates = distributeMatchDatesFromEnd(game.championship.startDate, game.championship.endDate, schedule.length);
    const rowsToCreate = schedule.flatMap((round) =>
      round.pairs
        .filter(([a, b]) => !existingPairs.has([a, b].sort().join("::")))
        .map(([teamAId, teamBId]) => ({
          gameId: input.gameId,
          poolId: null,
          roundName: `Knockout Stage - Round ${round.round}`,
          matchDate: matchDates[round.round - 1] ?? null,
          teamAId,
          teamBId,
        })),
    );

    if (rowsToCreate.length === 0) {
      return NextResponse.json({ created: 0, advanced: advancingTeamIds.length });
    }

    const result = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "match_pools",
      mutate: (tx) => tx.matchPool.createMany({ data: rowsToCreate }),
      recordId: () => input.gameId,
      newData: { advancingTeamIds, topPerPool: input.topPerPool, createdCount: rowsToCreate.length },
    });

    return NextResponse.json({ created: result.count, advanced: advancingTeamIds.length });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
