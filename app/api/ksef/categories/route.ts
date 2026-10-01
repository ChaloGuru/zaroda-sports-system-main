import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { toErrorResponse } from "@/lib/authorize";
import { getEditableEdition, requireKsefAdmin } from "@/lib/ksef";
import { ksefCategorySchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ctx = await requireKsefAdmin();
    const input = ksefCategorySchema.parse(await request.json());
    await getEditableEdition(input.editionId);

    const last = await prisma.ksefCategory.findFirst({
      where: { editionId: input.editionId, division: input.division },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const category = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "ksef_categories",
      mutate: (tx) => tx.ksefCategory.create({ data: { ...input, sortOrder: (last?.sortOrder ?? -1) + 1 } }),
      recordId: (result) => result.id,
      newData: input,
    });
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
