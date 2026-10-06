import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { learnerUpdateSchema } from "@/lib/validations";
import { LEARNER_FIELDS, updateLearner } from "@/lib/learners";

export const dynamic = "force-dynamic";

/** Corrects a learner's details; every event they're entered in follows. */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const existing = await prisma.learner.findUnique({ where: { id: params.id }, select: LEARNER_FIELDS });
    if (!existing) return NextResponse.json({ error: "Learner not found" }, { status: 404 });
    const ctx = await requireChampionshipAccess(existing.championshipId, ["TOURNAMENT_ADMIN", "SCOREKEEPER"]);

    const body: unknown = await request.json();
    const input = learnerUpdateSchema.parse(body);

    const learner = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "learners",
      oldData: existing,
      mutate: (tx) => updateLearner(tx, existing, input),
      recordId: () => existing.id,
      newData: input,
    });
    return NextResponse.json({ learner });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
