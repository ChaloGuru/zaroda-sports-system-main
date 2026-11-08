import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { toErrorResponse } from "@/lib/authorize";
import { learnerUpdateSchema } from "@/lib/validations";
import { LEARNER_FIELDS, assertEntriesOpen, assertRegistrationOpen, assertWithinAgeLimit, isTournamentAdmin, requireLearnerEditor, updateLearner } from "@/lib/learners";
import { findSameFaceInChampionship, refreshIdentityAlertsSafely, sameFaceMessage } from "@/lib/identity-checks";

export const dynamic = "force-dynamic";

/**
 * Deletes a learner registered by mistake, with their entries - by whoever
 * may edit them, and after the registration deadline only a tournament admin.
 * An entry in a locked event or approved team holds them (a tournament admin
 * can still go ahead), and a challenged or disqualified learner is never
 * deleted, so a disqualification can't be wiped and the child registered again.
 */
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const existing = await prisma.learner.findUnique({ where: { id: params.id }, select: LEARNER_FIELDS });
    if (!existing) return NextResponse.json({ error: "Learner not found" }, { status: 404 });
    const ctx = await requireLearnerEditor(existing);
    await assertRegistrationOpen(existing.championshipId);

    const name = `${existing.firstName} ${existing.lastName}`;
    const challenged = await prisma.learnerChallenge.findFirst({
      where: { learnerId: existing.id, status: { in: ["OPEN", "UPHELD"] } },
      select: { status: true },
    });
    if (challenged) {
      return NextResponse.json(
        {
          error:
            challenged.status === "UPHELD"
              ? `${name} was disqualified after a challenge, so their record is kept`
              : `${name} has an open challenge - a tournament admin must decide it before they can be deleted`,
        },
        { status: 409 },
      );
    }

    const entries = await prisma.participant.findMany({
      where: { learnerId: existing.id },
      select: { id: true, gameId: true, tournamentTeamId: true },
    });
    for (const entry of entries) {
      await assertEntriesOpen({ championshipId: existing.championshipId, gameId: entry.gameId, tournamentTeamId: entry.tournamentTeamId });
    }

    await withAudit({
      actorId: ctx.userId,
      operation: "DELETE",
      tableName: "learners",
      oldData: { ...existing, entries: entries.length },
      mutate: async (tx) => {
        await tx.participant.deleteMany({ where: { learnerId: existing.id } });
        return tx.learner.delete({ where: { id: existing.id }, select: { id: true } });
      },
      recordId: () => existing.id,
    });
    return NextResponse.json({ deleted: true, entriesRemoved: entries.length });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/** Corrects a learner's details; every event they're entered in follows. */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const existing = await prisma.learner.findUnique({ where: { id: params.id }, select: LEARNER_FIELDS });
    if (!existing) return NextResponse.json({ error: "Learner not found" }, { status: 404 });
    const ctx = await requireLearnerEditor(existing);

    const body: unknown = await request.json();
    const input = learnerUpdateSchema.parse(body);
    await assertRegistrationOpen(existing.championshipId);

    // New details mustn't turn this face into a second identity of another
    // learner in the championship - the rule the photo upload applies. Only
    // checked when who they are changes, so fixing a bib isn't held up.
    const pick = <K extends keyof typeof existing>(key: K) => (key in input ? (input as Record<string, unknown>)[key] : existing[key]) as (typeof existing)[K];
    const identityKeys = ["firstName", "lastName", "gender", "dateOfBirth", "birthCertNumber", "knecAssessmentNumber", "kemisUpi"] as const;
    const identityChanged = identityKeys.some((key) => String(pick(key) ?? "") !== String(existing[key] ?? ""));
    const { faceDescriptor } = identityChanged
      ? ((await prisma.learner.findUnique({ where: { id: existing.id }, select: { faceDescriptor: true } })) ?? {})
      : {};
    if (faceDescriptor) {
      const match = await findSameFaceInChampionship(prisma, existing.championshipId, Buffer.from(faceDescriptor), {
        firstName: pick("firstName"),
        lastName: pick("lastName"),
        gender: pick("gender"),
        dateOfBirth: pick("dateOfBirth"),
        birthCertNumber: pick("birthCertNumber"),
        knecAssessmentNumber: pick("knecAssessmentNumber"),
        kemisUpi: pick("kemisUpi"),
      }, existing.id);
      if (match && !(await isTournamentAdmin(existing.championshipId))) {
        return NextResponse.json({ error: sameFaceMessage(match.bibNumber), matchedBibNumber: match.bibNumber }, { status: 409 });
      }
    }

    // A corrected date of birth must still fit every event they're entered in.
    if (input.dateOfBirth) {
      const entries = await prisma.participant.findMany({ where: { learnerId: existing.id }, select: { game: { select: { schoolLevel: true } } } });
      await assertWithinAgeLimit(
        existing.championshipId,
        { ...existing, ...input, dateOfBirth: input.dateOfBirth },
        entries.map((e) => e.game.schoolLevel),
      );
    }

    const learner = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "learners",
      oldData: existing,
      mutate: (tx) => updateLearner(tx, existing, input),
      recordId: () => existing.id,
      newData: input,
    });
    await refreshIdentityAlertsSafely(prisma, existing.id);
    return NextResponse.json({ learner });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
