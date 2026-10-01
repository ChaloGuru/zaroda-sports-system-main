import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { AuthorizationError, toErrorResponse } from "@/lib/authorize";
import { getEditableEdition, requireKsefAdmin } from "@/lib/ksef";
import { ksefProjectUpdateSchema } from "@/lib/validations";
import { assertProjectPlacement } from "../placement";

export const dynamic = "force-dynamic";

async function loadProject(id: string) {
  const project = await prisma.ksefProject.findUnique({ where: { id } });
  if (!project) throw new AuthorizationError("Project not found", 404);
  await getEditableEdition(project.editionId);
  return project;
}

/**
 * Edits a project. `learners` / `mentors`, when given, replace the existing
 * lists. School and category are fixed once submitted (they decide where
 * and against whom it competes) - return it to draft first.
 */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await requireKsefAdmin();
    const existing = await loadProject(params.id);
    const input = ksefProjectUpdateSchema.parse(await request.json());

    const movesPlacement =
      (input.schoolId && input.schoolId !== existing.schoolId) ||
      (input.categoryId && input.categoryId !== existing.categoryId);
    if (movesPlacement && existing.status !== "DRAFT") {
      throw new Error("Return the project to draft before changing its school or category");
    }
    await assertProjectPlacement(existing.editionId, {
      schoolId: input.schoolId,
      categoryId: input.categoryId ?? (input.subCategoryId ? existing.categoryId : undefined),
      subCategoryId: input.subCategoryId,
    });

    const project = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "ksef_projects",
      oldData: existing,
      mutate: async (tx) => {
        if (input.learners) {
          await tx.ksefLearner.deleteMany({ where: { projectId: existing.id } });
          await tx.ksefLearner.createMany({
            data: input.learners.map((l) => ({ ...l, projectId: existing.id, grade: l.grade ?? null, upiNumber: l.upiNumber ?? null })),
          });
        }
        if (input.mentors) {
          await tx.ksefMentor.deleteMany({ where: { projectId: existing.id } });
          await tx.ksefMentor.createMany({
            data: input.mentors.map((m) => ({
              ...m,
              projectId: existing.id,
              tscNumber: m.tscNumber ?? null,
              phone: m.phone ?? null,
              email: m.email ?? null,
            })),
          });
        }
        return tx.ksefProject.update({
          where: { id: existing.id },
          data: {
            ...(input.schoolId !== undefined ? { schoolId: input.schoolId } : {}),
            ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
            // A new category invalidates the old sub-category unless one is given.
            ...(input.subCategoryId !== undefined
              ? { subCategoryId: input.subCategoryId }
              : input.categoryId && input.categoryId !== existing.categoryId
                ? { subCategoryId: null }
                : {}),
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.abstract !== undefined ? { abstract: input.abstract } : {}),
            ...(input.documentUrl !== undefined ? { documentUrl: input.documentUrl } : {}),
          },
        });
      },
      recordId: (result) => result.id,
      newData: input,
    });
    return NextResponse.json({ project });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

// Only a draft can be deleted - a submitted project has a code, judges and
// results attached; withdraw it instead.
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await requireKsefAdmin();
    const existing = await loadProject(params.id);
    if (existing.status !== "DRAFT") throw new Error("Only draft projects can be deleted - withdraw a submitted project instead");

    await withAudit({
      actorId: ctx.userId,
      operation: "DELETE",
      tableName: "ksef_projects",
      oldData: existing,
      mutate: (tx) => tx.ksefProject.delete({ where: { id: existing.id } }),
      recordId: (result) => result.id,
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
