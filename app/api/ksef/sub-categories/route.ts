import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { AuthorizationError, toErrorResponse } from "@/lib/authorize";
import { getEditableEdition, requireKsefAdmin } from "@/lib/ksef";
import { ksefSubCategorySchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ctx = await requireKsefAdmin();
    const input = ksefSubCategorySchema.parse(await request.json());
    const category = await prisma.ksefCategory.findUnique({
      where: { id: input.categoryId },
      include: { subCategories: { orderBy: { sortOrder: "desc" }, take: 1, select: { sortOrder: true } } },
    });
    if (!category) throw new AuthorizationError("Category not found", 404);
    await getEditableEdition(category.editionId);

    const subCategory = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "ksef_sub_categories",
      mutate: (tx) =>
        tx.ksefSubCategory.create({ data: { ...input, sortOrder: (category.subCategories[0]?.sortOrder ?? -1) + 1 } }),
      recordId: (result) => result.id,
      newData: input,
    });
    return NextResponse.json({ subCategory }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
