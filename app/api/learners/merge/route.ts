import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { LEARNER_FIELDS, mergeLearners } from "@/lib/learners";

export const dynamic = "force-dynamic";

const mergeSchema = z.object({
  keepLearnerId: z.string().uuid(),
  duplicateLearnerId: z.string().uuid(),
});

/** Joins a learner registered twice into one learner with one bib (see lib/learners.ts). */
export async function POST(request: Request) {
  try {
    const input = mergeSchema.parse(await request.json());
    const keep = await prisma.learner.findUnique({ where: { id: input.keepLearnerId }, select: { championshipId: true } });
    if (!keep) return NextResponse.json({ error: "Learner not found" }, { status: 404 });
    const ctx = await requireChampionshipAccess(keep.championshipId, ["TOURNAMENT_ADMIN"]);
    const duplicate = await prisma.learner.findUnique({ where: { id: input.duplicateLearnerId }, select: LEARNER_FIELDS });

    const result = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "learners",
      mutate: (tx) => mergeLearners(tx, input.keepLearnerId, input.duplicateLearnerId),
      recordId: () => input.keepLearnerId,
      // The deleted duplicate's details, so a wrong merge can be traced.
      oldData: { mergedLearner: duplicate },
      newData: input,
    });
    return NextResponse.json({ learner: result.learner, movedEntries: result.movedEntries });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
