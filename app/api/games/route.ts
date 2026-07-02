import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { gameCreateSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const championshipId = searchParams.get("championshipId");
    if (!championshipId) {
      return NextResponse.json({ error: "championshipId is required" }, { status: 400 });
    }

    const games = await prisma.game.findMany({
      where: { championshipId },
      orderBy: { name: "asc" },
      include: { _count: { select: { participants: true, heats: true, matchPools: true } } },
    });

    return NextResponse.json({ games });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const input = gameCreateSchema.parse(body);
    const ctx = await requireChampionshipAccess(input.championshipId, ["TOURNAMENT_ADMIN"]);

    const game = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "games",
      mutate: (tx) =>
        tx.game.create({
          data: {
            championshipId: input.championshipId,
            name: input.name,
            category: input.category,
            gender: input.gender,
            schoolLevel: input.schoolLevel,
            isTimed: input.isTimed,
            sport: input.sport ?? null,
            maxQualifiers: input.maxQualifiers,
            raceType: input.raceType ?? null,
            scheduledDate: input.scheduledDate ?? null,
          },
        }),
      recordId: (result) => result.id,
      newData: input,
    });

    return NextResponse.json({ game }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
