import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { AuthorizationError, toErrorResponse } from "@/lib/authorize";
import { getEditableEdition, requireKsefAdmin } from "@/lib/ksef";

export const dynamic = "force-dynamic";

// Removes a school from the edition (the School row itself is shared and
// kept). Refused while the school still has projects in this edition.
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await requireKsefAdmin();
    const link = await prisma.ksefEditionSchool.findUnique({ where: { id: params.id } });
    if (!link) throw new AuthorizationError("School registration not found", 404);
    await getEditableEdition(link.editionId);

    const projects = await prisma.ksefProject.count({ where: { editionId: link.editionId, schoolId: link.schoolId } });
    if (projects > 0) throw new Error("This school still has projects in this edition - remove them first");

    await withAudit({
      actorId: ctx.userId,
      operation: "DELETE",
      tableName: "ksef_edition_schools",
      oldData: link,
      mutate: (tx) => tx.ksefEditionSchool.delete({ where: { id: params.id } }),
      recordId: (result) => result.id,
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
