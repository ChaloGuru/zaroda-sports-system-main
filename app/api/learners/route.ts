import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { learnerRegistrationSchema } from "@/lib/validations";
import { requireChampionshipSchool } from "@/lib/championship-schools";
import { schoolEntryLabel } from "@/lib/school-levels";
import { assertNotAlreadyRegistered, assertRegistrationOpen, assertSchoolHasLearnerPlace, assertWithinAgeLimit, bibConflict, nextSchoolBib, requireLearnerEditor } from "@/lib/learners";
import { refreshIdentityAlertsSafely } from "@/lib/identity-checks";
import { getAuthContext, canViewChampionshipPrivateData, ownSchoolIds, toErrorResponse } from "@/lib/authorize";
import { ageDateOf } from "@/lib/learners";
import { identityAlertViews } from "@/lib/identity-checks";

export const dynamic = "force-dynamic";

/**
 * A championship's registered learners (optionally one school's), with the
 * events each is entered in - for entering a learner in another event and
 * for identity checks. Officials, or a school team's manager for their own
 * school; photos are fetched separately.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const championshipId = searchParams.get("championshipId");
    const schoolId = searchParams.get("schoolId");
    if (!championshipId) return NextResponse.json({ error: "championshipId is required" }, { status: 400 });

    const championship = await prisma.championship.findUnique({ where: { id: championshipId }, select: {
        id: true,
        tenantId: true,
        registrationClosesAt: true,
        ageCutoffDate: true,
        startDate: true,
        ageLimits: { select: { schoolLevel: true, maxAge: true } },
      },
    });
    if (!championship) return NextResponse.json({ error: "Championship not found" }, { status: 404 });
    // Officials see every learner; a school team's manager sees their school's.
    const ctx = await getAuthContext();
    const isOfficial = await canViewChampionshipPrivateData(ctx, championship);
    if (!isOfficial) {
      const managed = ctx ? await ownSchoolIds(ctx, championship.id) : [];
      if (!schoolId || !managed.includes(schoolId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const learners = await prisma.learner.findMany({
      where: { championshipId, ...(schoolId ? { schoolId } : {}) },
      orderBy: [{ bibNumber: "asc" }],
      select: {
        id: true,
        schoolId: true,
        firstName: true,
        lastName: true,
        gender: true,
        dateOfBirth: true,
        birthCertNumber: true,
        knecAssessmentNumber: true,
        kemisUpi: true,
        bibNumber: true,
        photoUpdatedAt: true,
        idDocumentKind: true,
        idDocumentUpdatedAt: true,
        documentsVerifiedAt: true,
        documentsVerifiedBy: true,
        school: { select: { name: true } },
        participants: { select: { id: true, gameId: true, game: { select: { name: true, schoolLevel: true } } } },
        challenges: {
          orderBy: { createdAt: "desc" },
          select: { id: true, reason: true, status: true, raisedBy: true, resolution: true, resolvedBy: true, resolvedAt: true, createdAt: true },
        },
      },
    });
    // Whether each photo could be face-matched - the descriptor itself never leaves the server.
    const faceMatched = new Set(
      (
        await prisma.learner.findMany({
          where: { championshipId, ...(schoolId ? { schoolId } : {}), faceDescriptor: { not: null } },
          select: { id: true },
        })
      ).map((l) => l.id),
    );
    // Identity alerts are for officials - a school sees the challenges, not the leads.
    const alerts = isOfficial ? await identityAlertViews(prisma, championship) : null;
    return NextResponse.json({
      learners: learners.map((l) => ({ ...l, faceMatched: faceMatched.has(l.id), identityAlerts: alerts?.get(l.id) ?? [] })),
      rules: {
        registrationClosesAt: championship.registrationClosesAt,
        ageDate: ageDateOf(championship),
        ageLimits: championship.ageLimits,
      },
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * A school registers a learner ahead of the day, with no event yet - their
 * teacher assigns them to races and teams later. The age limit is checked now,
 * for the level they're registered at: the school's Primary or JS entry, or the
 * championship's level where schools aren't split. The photo follows straight
 * after, and a learner can't enter an event without one.
 */
export async function POST(request: Request) {
  try {
    const input = learnerRegistrationSchema.parse(await request.json());
    const ctx = await requireLearnerEditor(input);
    const school = await requireChampionshipSchool(input.championshipId, input.schoolId);
    await assertRegistrationOpen(input.championshipId);
    const person = { ...input, dateOfBirth: input.dateOfBirth ?? null };
    const championship = await prisma.championship.findUnique({ where: { id: input.championshipId }, select: { schoolLevel: true } });
    const level = school.schoolLevel ?? championship?.schoolLevel;
    await assertWithinAgeLimit(input.championshipId, person, level ? [level] : []);
    const label = schoolEntryLabel(school.name, school.schoolLevel);
    const ids = await assertNotAlreadyRegistered(input.championshipId, input.schoolId, label, person);
    if (input.bibNumber) {
      const conflict = await bibConflict(prisma, input.championshipId, input.bibNumber, null);
      if (conflict) throw new Error(conflict);
    }
    const bibNumber = input.bibNumber ?? (await nextSchoolBib(prisma, input.championshipId, input.schoolId));

    const learner = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "learners",
      mutate: async (tx) => {
        await assertSchoolHasLearnerPlace(tx, input.championshipId, input.schoolId);
        return tx.learner.create({
          data: {
            championshipId: input.championshipId,
            schoolId: input.schoolId,
            firstName: input.firstName,
            lastName: input.lastName,
            gender: input.gender,
            dateOfBirth: person.dateOfBirth,
            ...ids,
            bibNumber,
          },
          select: { id: true, bibNumber: true },
        });
      },
      recordId: (result) => result.id,
      newData: { ...input, ...ids, bibNumber },
    });
    await refreshIdentityAlertsSafely(prisma, learner.id);
    return NextResponse.json({ learner }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
