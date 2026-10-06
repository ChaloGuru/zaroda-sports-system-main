import { NextResponse } from "next/server";
import type { z } from "zod";
import type { Role, SchoolLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { getAuthContext, canViewChampionshipPrivateData, requireGameAccess, requireTeamAccess, isGeographicallyRestricted, assertWithinGeographicScope, toErrorResponse } from "@/lib/authorize";
import { learnerEntryCreateSchema, learnerEntrySchema } from "@/lib/validations";
import { requireChampionshipSchool } from "@/lib/championship-schools";
import { schoolEntryLabel, gameSchoolLevelLabel } from "@/lib/school-levels";
import { parseTimeToSeconds } from "@/lib/scoring";
import { bibConflict, highestBib, nextSchoolBib, normalizeBirthCert } from "@/lib/learners";

export const dynamic = "force-dynamic";

const PARTICIPANT_ROLES: Role[] = ["TOURNAMENT_ADMIN", "SCOREKEEPER"];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get("gameId");
    const championshipId = searchParams.get("championshipId");
    const tournamentTeamId = searchParams.get("tournamentTeamId");
    if (!gameId && !championshipId && !tournamentTeamId) {
      return NextResponse.json({ error: "gameId, championshipId, or tournamentTeamId is required" }, { status: 400 });
    }

    // Resolve which championship this query targets so we can decide between
    // the public results view and the full staff view.
    let targetChampionshipId = championshipId;
    if (!targetChampionshipId && gameId) {
      targetChampionshipId = (await prisma.game.findUnique({ where: { id: gameId }, select: { championshipId: true } }))?.championshipId ?? null;
    }
    if (!targetChampionshipId && tournamentTeamId) {
      targetChampionshipId =
        (await prisma.tournamentTeam.findUnique({ where: { id: tournamentTeamId }, select: { championshipId: true } }))?.championshipId ?? null;
    }
    const championship = targetChampionshipId
      ? await prisma.championship.findUnique({
          where: { id: targetChampionshipId },
          select: { id: true, tenantId: true, isPublished: true },
        })
      : null;
    if (!championship) return NextResponse.json({ participants: [] });

    const isStaff = canViewChampionshipPrivateData(await getAuthContext(), championship);
    if (!isStaff && !championship.isPublished) return NextResponse.json({ participants: [] });

    const participants = await prisma.participant.findMany({
      where: {
        // Pinned to the resolved championship so mixed filters can't reach another one.
        championshipId: championship.id,
        ...(gameId ? { gameId } : {}),
        ...(tournamentTeamId ? { tournamentTeamId } : {}),
      },
      orderBy: { bibNumber: "asc" },
      include: {
        school: { select: { name: true } },
        tournamentTeam: { select: { name: true } },
        // Identity details for officials checking learners in the call room.
        ...(isStaff
          ? {
              learner: {
                select: {
                  id: true,
                  birthCertNumber: true,
                  dateOfBirth: true,
                  photoUpdatedAt: true,
                  participants: { select: { gameId: true, game: { select: { name: true } } } },
                },
              },
            }
          : {}),
      },
    });

    // Public callers (mostly viewing school pupils' results) never get
    // dates of birth, identity details or internal notes.
    return NextResponse.json({
      participants: isStaff ? participants : participants.map(({ dateOfBirth: _dob, notes: _notes, learnerId: _learner, ...rest }) => rest),
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && (body as { learnerId?: unknown }).learnerId) {
      return await enterExistingLearner(learnerEntrySchema.parse(body));
    }
    const input = learnerEntryCreateSchema.parse(body);

    let ctx;
    if (input.tournamentTeamId) {
      const team = await prisma.tournamentTeam.findUnique({
        where: { id: input.tournamentTeamId },
        select: { name: true, championshipId: true },
      });
      if (!team || team.championshipId !== input.championshipId) {
        return NextResponse.json({ error: "Team not found in this championship" }, { status: 404 });
      }
      ctx = await requireTeamAccess(input.championshipId, team.name);
    } else {
      ctx = await requireGameAccess(input.gameId, PARTICIPANT_ROLES);
    }

    const game = await prisma.game.findUnique({
      where: { id: input.gameId },
      select: { championshipId: true, schoolLevel: true },
    });
    if (!game || game.championshipId !== input.championshipId) {
      return NextResponse.json({ error: "Game not found in this championship" }, { status: 404 });
    }

    let schoolName: string | null = null;
    if (input.schoolId) {
      const school = await requireChampionshipSchool(input.championshipId, input.schoolId);
      schoolName = schoolEntryLabel(school.name, school.schoolLevel);
      assertSchoolLevelMatches(schoolName, school.schoolLevel, game.schoolLevel);
      const championship = await prisma.championship.findUnique({
        where: { id: input.championshipId },
        select: { level: true, county: true },
      });
      if (championship && isGeographicallyRestricted(championship.level)) {
        assertWithinGeographicScope(championship.county, school.county);
      }
    }

    const personalBest = input.personalBest ? parseTimeToSeconds(input.personalBest) : null;

    // A school's athlete is registered as a learner (who they are, with one
    // bib) plus this first event entry; further events reuse the learner.
    if (input.schoolId && !input.tournamentTeamId) {
      const schoolId = input.schoolId;
      const label = schoolName ?? "this school";
      const birthCertNumber = normalizeBirthCert(input.birthCertNumber);
      if (birthCertNumber) {
        const sameCert = await prisma.learner.findUnique({
          where: { championshipId_birthCertNumber: { championshipId: input.championshipId, birthCertNumber } },
          select: { firstName: true, lastName: true },
        });
        if (sameCert) {
          throw new Error(
            `Birth certificate entry no. ${birthCertNumber} is already registered to ${sameCert.firstName} ${sameCert.lastName} - add them to this event as an existing learner.`,
          );
        }
      }
      const sameName = await prisma.learner.findFirst({
        where: {
          championshipId: input.championshipId,
          schoolId,
          firstName: { equals: input.firstName.trim(), mode: "insensitive" },
          lastName: { equals: input.lastName.trim(), mode: "insensitive" },
        },
        select: { bibNumber: true, dateOfBirth: true },
      });
      // Two learners with one name at one school only when their dates of
      // birth show they're different people.
      const provenDifferent =
        sameName?.dateOfBirth && input.dateOfBirth && sameName.dateOfBirth.getTime() !== input.dateOfBirth.getTime();
      if (sameName && !provenDifferent) {
        throw new Error(
          `${input.firstName} ${input.lastName} is already registered for ${label} (bib ${sameName.bibNumber}) - add them to this event as an existing learner.`,
        );
      }

      let bib = input.bibNumber ?? null;
      if (bib) {
        const conflict = await bibConflict(prisma, input.championshipId, bib, null);
        if (conflict) throw new Error(conflict);
      } else {
        bib = await nextSchoolBib(prisma, input.championshipId, schoolId, label);
      }
      const bibNumber = bib;

      const participant = await withAudit({
        actorId: ctx.userId,
        operation: "INSERT",
        tableName: "participants",
        mutate: async (tx) => {
          const learner = await tx.learner.create({
            data: {
              championshipId: input.championshipId,
              schoolId,
              firstName: input.firstName.trim(),
              lastName: input.lastName.trim(),
              gender: input.gender,
              dateOfBirth: input.dateOfBirth ?? null,
              birthCertNumber,
              bibNumber,
            },
          });
          return tx.participant.create({
            data: {
              championshipId: input.championshipId,
              gameId: input.gameId,
              schoolId,
              learnerId: learner.id,
              firstName: learner.firstName,
              lastName: learner.lastName,
              gender: learner.gender,
              dateOfBirth: learner.dateOfBirth,
              bibNumber,
              personalBest,
              notes: input.notes ?? null,
            },
          });
        },
        recordId: (result) => result.id,
        newData: { ...input, birthCertNumber, bibNumber },
      });
      return NextResponse.json({ participant }, { status: 201 });
    }

    let bibNumber = input.bibNumber ?? null;
    if (bibNumber) {
      const conflict = await bibConflict(prisma, input.championshipId, bibNumber, null);
      if (conflict) throw new Error(conflict);
    } else if (input.tournamentTeamId) {
      // Ball-game roster entries have no school bib range to draw from - bibNumber
      // is purely an internal identifier here (jerseyNumber is what's shown to
      // people), so just take the next unused number championship-wide.
      bibNumber = (await highestBib(prisma, input.championshipId)) + 1;
    } else {
      throw new Error("bibNumber must be provided directly when a participant has no schoolId or tournamentTeamId (e.g. open-tournament entries)");
    }

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
            jerseyNumber: input.jerseyNumber ?? null,
            playingPosition: input.playingPosition ?? null,
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

/** Primary/JS championships split each school into a Primary and a JS entry - an athlete enters under the one matching the event's level. */
function assertSchoolLevelMatches(schoolName: string, schoolLevel: SchoolLevel | null, gameLevel: SchoolLevel) {
  if (schoolLevel && schoolLevel !== gameLevel) {
    throw new Error(
      `${schoolName} can't enter a ${gameSchoolLevelLabel(gameLevel)} event - pick the school's ${gameSchoolLevelLabel(gameLevel)} entry.`,
    );
  }
}

/** Enters an already-registered learner in another event, with the same bib. */
async function enterExistingLearner(input: z.infer<typeof learnerEntrySchema>) {
  const ctx = await requireGameAccess(input.gameId, PARTICIPANT_ROLES);
  const [game, learner] = await Promise.all([
    prisma.game.findUnique({ where: { id: input.gameId }, select: { championshipId: true, schoolLevel: true, name: true } }),
    prisma.learner.findUnique({
      where: { id: input.learnerId },
      include: { school: { select: { name: true, schoolLevel: true } } },
    }),
  ]);
  if (!game || game.championshipId !== input.championshipId) {
    return NextResponse.json({ error: "Game not found in this championship" }, { status: 404 });
  }
  if (!learner || learner.championshipId !== input.championshipId) {
    return NextResponse.json({ error: "Learner not found in this championship" }, { status: 404 });
  }
  if (learner.school) {
    const label = schoolEntryLabel(learner.school.name, learner.school.schoolLevel);
    assertSchoolLevelMatches(label, learner.school.schoolLevel, game.schoolLevel);
  }
  const already = await prisma.participant.findFirst({ where: { gameId: input.gameId, learnerId: learner.id }, select: { id: true } });
  if (already) {
    return NextResponse.json({ error: `${learner.firstName} ${learner.lastName} is already entered in ${game.name}` }, { status: 409 });
  }

  const participant = await withAudit({
    actorId: ctx.userId,
    operation: "INSERT",
    tableName: "participants",
    mutate: (tx) =>
      tx.participant.create({
        data: {
          championshipId: input.championshipId,
          gameId: input.gameId,
          schoolId: learner.schoolId,
          learnerId: learner.id,
          firstName: learner.firstName,
          lastName: learner.lastName,
          gender: learner.gender,
          dateOfBirth: learner.dateOfBirth,
          bibNumber: learner.bibNumber,
          personalBest: input.personalBest ? parseTimeToSeconds(input.personalBest) : null,
        },
      }),
    recordId: (result) => result.id,
    newData: { ...input, bibNumber: learner.bibNumber },
  });
  return NextResponse.json({ participant }, { status: 201 });
}
