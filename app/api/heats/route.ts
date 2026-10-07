import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { canSeeGame, requireGameAccess, toErrorResponse } from "@/lib/authorize";
import { seedLanes, DEFAULT_LANE_PRIORITY } from "@/lib/scoring";

export const dynamic = "force-dynamic";

const heatCreateSchema = z.object({
  gameId: z.string().uuid(),
  heatNumber: z.number().int().positive(),
  heatType: z.string().max(50).default("heat"),
  participantIds: z.array(z.string().uuid()).min(1),
  lanePriority: z.array(z.number().int().positive()).optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get("gameId");
    if (!gameId) return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    // Unpublished championships are only for the people running them.
    if (!(await canSeeGame(gameId))) return NextResponse.json({ heats: [] });

    const heats = await prisma.heat.findMany({
      where: { gameId },
      orderBy: { heatNumber: "asc" },
      include: {
        participants: {
          orderBy: [{ position: "asc" }, { laneNumber: "asc" }],
          include: {
            participant: {
              select: {
                firstName: true,
                lastName: true,
                bibNumber: true,
                gender: true,
                personalBest: true,
                school: { select: { name: true } },
                tournamentTeam: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ heats });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const input = heatCreateSchema.parse(body);

    const game = await prisma.game.findUnique({ where: { id: input.gameId } });
    if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

    const ctx = await requireGameAccess(game.id, ["TOURNAMENT_ADMIN", "SCOREKEEPER", "CHIEF_CALLROOM_MANAGER"]);

    // Pinned to this game so athletes from another game (or another
    // tenant's championship) can't be pulled into the heat.
    const participants = await prisma.participant.findMany({
      where: { id: { in: input.participantIds }, gameId: game.id },
      select: { id: true, personalBest: true },
    });
    if (participants.length !== new Set(input.participantIds).size) {
      return NextResponse.json({ error: "Every athlete in a heat must be entered in this event" }, { status: 400 });
    }

    const laneSeeds = seedLanes(
      participants.map((p) => ({ participantId: p.id, personalBest: p.personalBest ? Number(p.personalBest) : null })),
      input.lanePriority ?? DEFAULT_LANE_PRIORITY,
    );
    const laneByParticipant = new Map(laneSeeds.map((seed) => [seed.participantId, seed.laneNumber]));

    const heat = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "heats",
      mutate: (tx) =>
        tx.heat.create({
          data: {
            gameId: input.gameId,
            heatNumber: input.heatNumber,
            heatType: input.heatType,
            participants: {
              create: input.participantIds.map((participantId) => ({
                participantId,
                laneNumber: laneByParticipant.get(participantId) ?? null,
              })),
            },
          },
          include: { participants: true },
        }),
      recordId: (result) => result.id,
      newData: input,
    });

    return NextResponse.json({ heat }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
