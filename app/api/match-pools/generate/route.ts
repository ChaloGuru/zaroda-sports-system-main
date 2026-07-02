import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { generateFixturesSchema } from "@/lib/validations";
import { generateRoundRobinSchedule } from "@/lib/scoring";

export const dynamic = "force-dynamic";

/**
 * Schedules a full bye-aware round robin (see lib/scoring.ts) for either one
 * pool's teams, or - when poolId is omitted - every team registered for the
 * game. Skips any pairing that's already scheduled, so this is safe to
 * re-run after adding more teams to a pool.
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const input = generateFixturesSchema.parse(body);

    const game = await prisma.game.findUnique({ where: { id: input.gameId } });
    if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(game.championshipId, ["TOURNAMENT_ADMIN", "SCOREKEEPER"]);

    let poolName: string | null = null;
    if (input.poolId) {
      const pool = await prisma.pool.findUnique({ where: { id: input.poolId } });
      if (!pool || pool.gameId !== input.gameId) {
        return NextResponse.json({ error: "Pool not found in this game" }, { status: 404 });
      }
      poolName = pool.name;
    }

    // Omitting poolId means "teams not assigned to any pool" - not "every
    // team in the game" - so already-pooled teams aren't mixed in here.
    const teams = await prisma.tournamentTeam.findMany({
      where: { gameId: input.gameId, poolId: input.poolId ?? null },
      select: { id: true },
    });
    if (teams.length < 2) {
      return NextResponse.json({ error: "Need at least two teams to generate fixtures" }, { status: 400 });
    }

    const existing = await prisma.matchPool.findMany({
      where: { gameId: input.gameId },
      select: { teamAId: true, teamBId: true },
    });
    const existingPairs = new Set(existing.map((mp) => [mp.teamAId, mp.teamBId].sort().join("::")));

    const schedule = generateRoundRobinSchedule(teams.map((t) => t.id));
    const rowsToCreate = schedule.flatMap((round) =>
      round.pairs
        .filter(([a, b]) => !existingPairs.has([a, b].sort().join("::")))
        .map(([teamAId, teamBId]) => ({
          gameId: input.gameId,
          poolId: input.poolId ?? null,
          roundName: poolName ? `${poolName} - Round ${round.round}` : `Round ${round.round}`,
          teamAId,
          teamBId,
        })),
    );

    if (rowsToCreate.length === 0) {
      return NextResponse.json({ created: 0, rounds: schedule.length });
    }

    const result = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "match_pools",
      mutate: (tx) => tx.matchPool.createMany({ data: rowsToCreate }),
      recordId: () => input.gameId,
      newData: { poolId: input.poolId ?? null, createdCount: rowsToCreate.length },
    });

    return NextResponse.json({ created: result.count, rounds: schedule.length });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
