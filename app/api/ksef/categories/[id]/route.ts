import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { AuthorizationError, toErrorResponse } from "@/lib/authorize";
import { getEditableEdition, requireKsefAdmin } from "@/lib/ksef";
import { ksefCategoryUpdateSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

// Edit or disable a category. There's no delete: a disabled category stops
// being offered for new projects but keeps any projects already in it.
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await requireKsefAdmin();
    const existing = await prisma.ksefCategory.findUnique({ where: { id: params.id } });
    if (!existing) throw new AuthorizationError("Category not found", 404);
    await getEditableEdition(existing.editionId);
    const input = ksefCategoryUpdateSchema.parse(await request.json());

    const category = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "ksef_categories",
      oldData: existing,
      mutate: (tx) => tx.ksefCategory.update({ where: { id: params.id }, data: input }),
      recordId: (result) => result.id,
      newData: input,
    });
    return NextResponse.json({ category });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
