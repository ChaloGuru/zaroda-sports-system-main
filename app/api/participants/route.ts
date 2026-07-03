import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, isGeographicallyRestricted, assertWithinGeographicScope, toErrorResponse } from "@/lib/authorize";
import { participantCreateSchema } from "@/lib/validations";
import { assignNextBibNumber, parseTimeToSeconds } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get("gameId");
    const championshipId = searchParams.get("championshipId");
    if (!gameId && !championshipId) {
      return NextResponse.json({ error: "gameId or championshipId is required" }, { status: 400 });
    }

    const participants = await prisma.participant.findMany({
      where: { ...(gameId ? { gameId } : {}), ...(championshipId ? { championshipId } : {}) },
      orderBy: { bibNumber: "asc" },
      include: { school: { select: { name: true } }, tournamentTeam: { select: { name: true } } },
    });

    return NextResponse.json({ participants });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const input = participantCreateSchema.parse(body);
    const ctx = await requireChampionshipAccess(input.championshipId, ["TOURNAMENT_ADMIN", "SCOREKEEPER"]);

    if (input.schoolId) {
      const championship = await prisma.championship.findUnique({
        where: { id: input.championshipId },
        select: { level: true, county: true },
      });
      if (championship && isGeographicallyRestricted(championship.level)) {
        const school = await prisma.school.findUnique({ where: { id: input.schoolId }, select: { county: true } });
        assertWithinGeographicScope(championship.county, school?.county);
      }
    }

    let bibNumber = input.bibNumber ?? null;
    if (!bibNumber) {
      if (!input.schoolId) {
        throw new Error("bibNumber must be provided directly when a participant has no schoolId (e.g. open-tournament entries)");
      }
      const range = await prisma.schoolBibRange.findUnique({
        where: { championshipId_schoolId: { championshipId: input.championshipId, schoolId: input.schoolId } },
      });
      const existing = await prisma.participant.findMany({
        where: { championshipId: input.championshipId, schoolId: input.schoolId },
        select: { bibNumber: true },
      });
      bibNumber = assignNextBibNumber(
        input.schoolId,
        range ? { schoolId: range.schoolId, rangeStart: range.rangeStart, rangeEnd: range.rangeEnd } : undefined,
        existing.map((p) => p.bibNumber),
      );
    }

    const personalBest = input.personalBest ? parseTimeToSeconds(input.personalBest) : null;

    const participant = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "participants",
      mutate: (tx) =>
        tx.participant.create({
          data: {
            championshipId: input.championshipId,
            gameId: input.gameId,
            schoolId: input.schoolId ?? null,
            tournamentTeamId: input.tournamentTeamId ?? null,
            firstName: input.firstName,
            lastName: input.lastName,
            gender: input.gender,
            dateOfBirth: input.dateOfBirth ?? null,
            bibNumber: bibNumber as number,
            personalBest,
            notes: input.notes ?? null,
          },
        }),
      recordId: (result) => result.id,
      newData: { ...input, bibNumber },
    });

    return NextResponse.json({ participant }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
