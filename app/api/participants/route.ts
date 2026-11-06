import { NextResponse } from "next/server";
import type { z } from "zod";
import type { Role, SchoolLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { getAuthContext, canViewChampionshipPrivateData, managedTeamSchoolIds, managesTeam, type AuthContext, requireGameAccess, requireTeamAccess, isGeographicallyRestricted, assertWithinGeographicScope, toErrorResponse } from "@/lib/authorize";
import { learnerEntryCreateSchema, learnerEntrySchema } from "@/lib/validations";
import { requireChampionshipSchool } from "@/lib/championship-schools";
import { schoolEntryLabel, gameSchoolLevelLabel } from "@/lib/school-levels";
import { parseTimeToSeconds } from "@/lib/scoring";
import { assertEntriesOpen, assertWithinAgeLimit, bibConflict, highestBib } from "@/lib/learners";

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

    // Officials see dates of birth, notes and learner identity; a team's
    // manager sees them for their own team's roster only.
    const ctx = await getAuthContext();
    let isStaff = await canViewChampionshipPrivateData(ctx, championship);
    if (!isStaff && tournamentTeamId) {
      const team = await prisma.tournamentTeam.findUnique({ where: { id: tournamentTeamId }, select: { name: true } });
      isStaff = !!team && (await managesTeam(ctx, championship.id, team.name));
    }
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
                  knecAssessmentNumber: true,
                  kemisUpi: true,
                  dateOfBirth: true,
                  photoUpdatedAt: true,
                  idDocumentKind: true,
                  idDocumentUpdatedAt: true,
                  documentsVerifiedAt: true,
                  documentsVerifiedBy: true,
                  participants: { select: { gameId: true, game: { select: { name: true } } } },
                  challenges: {
                    where: { status: { in: ["OPEN", "UPHELD"] } },
                    select: { id: true, reason: true, status: true, raisedBy: true, createdAt: true },
                  },
                  _count: { select: { alertsAsA: { where: { reviewedAt: null } }, alertsAsB: { where: { reviewedAt: null } } } },
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
    let team: { name: string; championshipId: string; schoolId: string | null } | null = null;
    if (input.tournamentTeamId) {
      team = await prisma.tournamentTeam.findUnique({
        where: { id: input.tournamentTeamId },
        select: { name: true, championshipId: true, schoolId: true },
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
      select: { championshipId: true, schoolLevel: true, name: true },
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

    // A school team's players are that school's learners.
    if (team?.schoolId) {
      const school = await prisma.school.findUnique({ where: { id: team.schoolId }, select: { name: true, schoolLevel: true } });
      schoolName = school ? schoolEntryLabel(school.name, school.schoolLevel) : null;
    }

    const personalBest = input.personalBest ? parseTimeToSeconds(input.personalBest) : null;

    await assertEntriesOpen(input);

    // A school's learner needs their photo before any entry, so they're
    // registered first (POST /api/learners) and then entered by learnerId.
    // Open-tournament entries have no school and no learner.
    if (team?.schoolId || input.schoolId) {
      return NextResponse.json({ error: "Register this learner with their photo first, then enter them" }, { status: 400 });
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

/** Officials enter anyone; a teacher enters their own school's learners in athletics events. */
async function requireIndividualEntryAccess(
  input: { championshipId: string; gameId: string },
  game: { category: string },
  schoolId: string | null,
): Promise<AuthContext> {
  try {
    return await requireGameAccess(input.gameId, PARTICIPANT_ROLES);
  } catch (error) {
    const ctx = await getAuthContext();
    const ownSchool = !!ctx && !!schoolId && (await managedTeamSchoolIds(ctx, input.championshipId)).includes(schoolId);
    if (ctx && ownSchool && game.category === "ATHLETICS") return ctx;
    throw error;
  }
}

/** Enters an already-registered learner in another event (or their school's team), with the same bib. */
async function enterExistingLearner(input: z.infer<typeof learnerEntrySchema>) {
  let team: { name: string; championshipId: string; schoolId: string | null } | null = null;
  if (input.tournamentTeamId) {
    team = await prisma.tournamentTeam.findUnique({
      where: { id: input.tournamentTeamId },
      select: { name: true, championshipId: true, schoolId: true },
    });
    if (!team || team.championshipId !== input.championshipId) {
      return NextResponse.json({ error: "Team not found in this championship" }, { status: 404 });
    }
  }
  const teamCtx = team ? await requireTeamAccess(input.championshipId, team.name) : null;
  const [game, learner] = await Promise.all([
    prisma.game.findUnique({ where: { id: input.gameId }, select: { championshipId: true, schoolLevel: true, name: true, category: true } }),
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
  const ctx = teamCtx ?? (await requireIndividualEntryAccess(input, game, learner.schoolId));
  if (team && learner.schoolId !== team.schoolId) {
    return NextResponse.json({ error: `${learner.firstName} ${learner.lastName} isn't registered for ${team.name}'s school` }, { status: 400 });
  }
  if (learner.school) {
    const label = schoolEntryLabel(learner.school.name, learner.school.schoolLevel);
    assertSchoolLevelMatches(label, learner.school.schoolLevel, game.schoolLevel);
  }
  await assertEntriesOpen(input);
  if (!learner.photoUpdatedAt) {
    return NextResponse.json({ error: `Add ${learner.firstName} ${learner.lastName}'s photo before entering them in an event` }, { status: 400 });
  }
  await assertWithinAgeLimit(input.championshipId, learner, [game.schoolLevel]);
  const upheld = await prisma.learnerChallenge.findFirst({ where: { learnerId: learner.id, status: "UPHELD" }, select: { id: true } });
  if (upheld) {
    return NextResponse.json(
      { error: `${learner.firstName} ${learner.lastName} was disqualified after a challenge to their age or identity` },
      { status: 409 },
    );
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
          schoolId: team ? null : learner.schoolId,
          tournamentTeamId: input.tournamentTeamId ?? null,
          jerseyNumber: input.jerseyNumber ?? null,
          playingPosition: input.playingPosition ?? null,
          learnerId: learner.id,
          firstName: learner.firstName,
          lastName: learner.lastName,
          gender: learner.gender,
          dateOfBirth: learner.dateOfBirth,
          bibNumber: learner.bibNumber,
          personalBest: input.personalBest ? parseTimeToSeconds(input.personalBest) : null,
          notes: input.notes ?? null,
        },
      }),
    recordId: (result) => result.id,
    newData: { ...input, bibNumber: learner.bibNumber },
  });
  return NextResponse.json({ participant }, { status: 201 });
}
