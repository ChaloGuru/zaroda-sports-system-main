import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { AuthorizationError, toErrorResponse } from "@/lib/authorize";
import { getEditableEdition, requireKsefAdmin } from "@/lib/ksef";
import { ksefCriterionUpdateSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

// Edit or disable a judging criterion. Once judges have scored against it,
// its maximum can't drop below a score already given.
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await requireKsefAdmin();
    const existing = await prisma.ksefCriterion.findUnique({ where: { id: params.id } });
    if (!existing) throw new AuthorizationError("Criterion not found", 404);
    await getEditableEdition(existing.editionId);
    const input = ksefCriterionUpdateSchema.parse(await request.json());

    if (input.maxScore !== undefined && input.maxScore < existing.maxScore) {
      const highest = await prisma.ksefScore.aggregate({ where: { criterionId: existing.id }, _max: { score: true } });
      const highestGiven = Number(highest._max.score ?? 0);
      if (highestGiven > input.maxScore) {
        throw new Error(`A judge has already given ${highestGiven} for this criterion - the maximum can't go below that`);
      }
    }

    const criterion = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "ksef_criteria",
      oldData: existing,
      mutate: (tx) => tx.ksefCriterion.update({ where: { id: params.id }, data: input }),
      recordId: (result) => result.id,
      newData: input,
    });
    return NextResponse.json({ criterion });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
