import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { matchPoolSchema } from "@/lib/validations";
import { resolveTeamNames } from "@/lib/match-pool-teams";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get("gameId");
    if (!gameId) return NextResponse.json({ error: "gameId is required" }, { status: 400 });

    const matchPools = await prisma.matchPool.findMany({ where: { gameId }, orderBy: { createdAt: "asc" } });
    const names = await resolveTeamNames(matchPools.flatMap((mp) => [mp.teamAId, mp.teamBId]));

    const enriched = matchPools.map((mp) => ({
      ...mp,
      teamAName: names.get(mp.teamAId) ?? "Unknown team",
      teamBName: names.get(mp.teamBId) ?? "Unknown team",
    }));

    return NextResponse.json({ matchPools: enriched });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const input = matchPoolSchema.parse(body);

    const game = await prisma.game.findUnique({ where: { id: input.gameId } });
    if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

    if (input.poolId) {
      const pool = await prisma.pool.findUnique({ where: { id: input.poolId } });
      if (!pool || pool.gameId !== input.gameId) {
        return NextResponse.json({ error: "Pool not found in this game" }, { status: 404 });
      }
    }

    const ctx = await requireChampionshipAccess(game.championshipId, ["TOURNAMENT_ADMIN", "SCOREKEEPER"]);

    const matchPool = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "match_pools",
      mutate: (tx) =>
        tx.matchPool.create({
          data: {
            gameId: input.gameId,
            poolId: input.poolId ?? null,
            roundName: input.roundName,
            teamAId: input.teamAId,
            teamBId: input.teamBId,
            teamAScore: input.teamAScore ?? null,
            teamBScore: input.teamBScore ?? null,
            notes: input.notes ?? null,
          },
        }),
      recordId: (result) => result.id,
      newData: input,
    });

    return NextResponse.json({ matchPool }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
