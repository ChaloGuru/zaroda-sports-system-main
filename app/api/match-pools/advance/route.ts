import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireGameAccess, toErrorResponse } from "@/lib/authorize";
import { advanceTopTeamsSchema } from "@/lib/validations";
import { computeStandings, type MatchResult, type WalkoverResult } from "@/lib/scoring";
import { distributeMatchDatesFromEnd } from "@/lib/match-day";
import { buildBracket, firstRoundName, nextPowerOfTwo, seedQualifiers } from "@/lib/bracket";

export const dynamic = "force-dynamic";

/**
 * Automatic pool -> knockout progression. Ranks every pool by the same
 * standings used everywhere else (lib/scoring.ts computeStandings), takes the
 * top `topPerPool` from each, and draws a seeded single-elimination bracket
 * (lib/bracket.ts): pool winners meet other pools' runners-up, the top seeds
 * get byes when the count is not a power of two, and pool-mates are kept apart
 * in round one. Later rounds come from "Advance winners" (./advance-round),
 * which pairs winners in the order these fixtures are created.
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

    const ctx = await requireGameAccess(game.id, ["TOURNAMENT_ADMIN", "SCOREKEEPER", "GAME_COORDINATOR"]);

    const pools = await prisma.pool.findMany({
      where: { gameId: input.gameId },
      include: { teams: { select: { id: true } } },
      orderBy: { name: "asc" },
    });
    if (pools.length === 0) {
      return NextResponse.json({ error: "This game has no pools to advance teams from" }, { status: 400 });
    }

    const allMatchPools = await prisma.matchPool.findMany({
      where: { gameId: input.gameId },
      select: { poolId: true, teamAId: true, teamBId: true, teamAScore: true, teamBScore: true, isWalkover: true, winnerId: true },
    });
    if (allMatchPools.some((mp) => mp.poolId === null)) {
      return NextResponse.json(
        { error: "This game already has matches outside the pools (a knockout drawn earlier, or added by hand). Delete them first if you want to draw the knockout from the pool standings." },
        { status: 409 },
      );
    }
    const unplayed = allMatchPools.filter((mp) => !mp.isWalkover && (mp.teamAScore === null || mp.teamBScore === null)).length;
    if (unplayed > 0) {
      return NextResponse.json(
        { error: `${unplayed} pool match${unplayed === 1 ? " still has" : "es still have"} no result. Enter every pool result (or a walkover) before drawing the knockout.` },
        { status: 400 },
      );
    }

    const poolStandings = pools.map((pool) => {
      const teamIds = pool.teams.map((t) => t.id);
      const poolMatchPools = allMatchPools.filter((mp) => mp.poolId === pool.id);
      const results: MatchResult[] = poolMatchPools
        .filter((mp) => !mp.isWalkover && mp.teamAScore !== null && mp.teamBScore !== null)
        .map((mp) => ({ teamAId: mp.teamAId, teamBId: mp.teamBId, teamAScore: mp.teamAScore as number, teamBScore: mp.teamBScore as number }));
      const walkovers: WalkoverResult[] = poolMatchPools
        .filter((mp) => mp.isWalkover && mp.winnerId !== null)
        .map((mp) => ({ teamAId: mp.teamAId, teamBId: mp.teamBId, winnerId: mp.winnerId as string }));
      return teamIds.length ? computeStandings(teamIds, results, game.sport!, walkovers).map((row) => row.teamId) : [];
    });

    const seeds = seedQualifiers(poolStandings, input.topPerPool);
    if (seeds.length < 2) {
      return NextResponse.json({ error: "Not enough advancing teams to draw a knockout" }, { status: 400 });
    }
    const bracket = buildBracket(seeds);
    const size = nextPowerOfTwo(seeds.length);
    const roundName = firstRoundName(size);
    const roundCount = Math.log2(size);
    const matchDate = distributeMatchDatesFromEnd(game.championship.startDate, game.championship.endDate, roundCount)[0] ?? null;

    // Explicit, increasing createdAt keeps bracket order: "Advance winners" pairs winners in creation order.
    const base = Date.now();
    const rowsToCreate = bracket.map((m, i) => ({
      gameId: input.gameId,
      poolId: null,
      roundName,
      matchDate,
      teamAId: m.teamA.teamId,
      teamBId: m.teamB?.teamId ?? m.teamA.teamId,
      isBye: !m.teamB,
      winnerId: m.teamB ? null : m.teamA.teamId,
      createdAt: new Date(base + i),
    }));

    const result = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "match_pools",
      mutate: (tx) => tx.matchPool.createMany({ data: rowsToCreate }),
      recordId: () => input.gameId,
      newData: { seeds: seeds.map((s) => s.teamId), topPerPool: input.topPerPool, roundName, createdCount: rowsToCreate.length },
    });

    return NextResponse.json({
      created: result.count,
      advanced: seeds.length,
      roundName,
      byes: rowsToCreate.filter((r) => r.isBye).length,
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
