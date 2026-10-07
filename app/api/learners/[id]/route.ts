import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { toErrorResponse } from "@/lib/authorize";
import { learnerUpdateSchema } from "@/lib/validations";
import { LEARNER_FIELDS, assertRegistrationOpen, assertWithinAgeLimit, requireLearnerEditor, updateLearner } from "@/lib/learners";
import { refreshIdentityAlertsSafely } from "@/lib/identity-checks";

export const dynamic = "force-dynamic";

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
