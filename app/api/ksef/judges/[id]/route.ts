import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { AuthorizationError, toErrorResponse } from "@/lib/authorize";
import { getEditableEdition, requireKsefAdmin } from "@/lib/ksef";

export const dynamic = "force-dynamic";

const judgeUpdateSchema = z.object({
  isActive: z.boolean().optional(),
  specialty: z.string().trim().max(200).nullable().optional(),
  role: z.enum(["JUDGE", "CHIEF_JUDGE", "SRC_MEMBER"]).optional(),
});

// Deactivate/reactivate a judge or edit their specialty. Judges aren't
// deleted - their submitted score sheets are part of the results record.
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await requireKsefAdmin();
    const existing = await prisma.ksefJudge.findUnique({ where: { id: params.id } });
    if (!existing) throw new AuthorizationError("Judge not found", 404);
    await getEditableEdition(existing.editionId);
    const input = judgeUpdateSchema.parse(await request.json());

    const judge = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "ksef_judges",
      oldData: existing,
      mutate: (tx) => tx.ksefJudge.update({ where: { id: existing.id }, data: input }),
      recordId: (result) => result.id,
      newData: input,
    });
    return NextResponse.json({ judge });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
