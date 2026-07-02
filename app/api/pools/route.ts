import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { poolSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get("gameId");
    if (!gameId) return NextResponse.json({ error: "gameId is required" }, { status: 400 });

    const pools = await prisma.pool.findMany({
      where: { gameId },
      orderBy: { name: "asc" },
      include: { _count: { select: { teams: true } } },
    });

    return NextResponse.json({ pools });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const input = poolSchema.parse(body);

    const game = await prisma.game.findUnique({ where: { id: input.gameId } });
    if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(game.championshipId, ["TOURNAMENT_ADMIN"]);

    const pool = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "pools",
      mutate: (tx) => tx.pool.create({ data: { gameId: input.gameId, name: input.name } }),
      recordId: (result) => result.id,
      newData: input,
    });

    return NextResponse.json({ pool }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
