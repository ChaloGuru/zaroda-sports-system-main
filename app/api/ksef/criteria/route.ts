import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { toErrorResponse } from "@/lib/authorize";
import { getEditableEdition, requireKsefAdmin } from "@/lib/ksef";
import { ksefCriterionSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ctx = await requireKsefAdmin();
    const input = ksefCriterionSchema.parse(await request.json());
    await getEditableEdition(input.editionId);

    const last = await prisma.ksefCriterion.findFirst({
      where: { editionId: input.editionId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const criterion = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "ksef_criteria",
      mutate: (tx) =>
        tx.ksefCriterion.create({
          data: { ...input, description: input.description ?? null, sortOrder: (last?.sortOrder ?? -1) + 1 },
        }),
      recordId: (result) => result.id,
      newData: input,
    });
    return NextResponse.json({ criterion }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
