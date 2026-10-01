import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { AuthorizationError, toErrorResponse } from "@/lib/authorize";
import { getEditableEdition, requireKsefAdmin } from "@/lib/ksef";
import { ksefSubCategoryUpdateSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await requireKsefAdmin();
    const existing = await prisma.ksefSubCategory.findUnique({
      where: { id: params.id },
      include: { category: { select: { editionId: true } } },
    });
    if (!existing) throw new AuthorizationError("Sub-category not found", 404);
    await getEditableEdition(existing.category.editionId);
    const input = ksefSubCategoryUpdateSchema.parse(await request.json());

    const subCategory = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "ksef_sub_categories",
      oldData: existing,
      mutate: (tx) => tx.ksefSubCategory.update({ where: { id: params.id }, data: input }),
      recordId: (result) => result.id,
      newData: input,
    });
    return NextResponse.json({ subCategory });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
