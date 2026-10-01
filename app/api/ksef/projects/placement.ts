import { prisma } from "@/lib/prisma";

/**
 * A project's school must be registered for its edition, and its
 * category / sub-category must be active ones from that same edition.
 */
export async function assertProjectPlacement(
  editionId: string,
  input: { schoolId?: string; categoryId?: string; subCategoryId?: string | null },
): Promise<void> {
  if (input.schoolId) {
    const registered = await prisma.ksefEditionSchool.findUnique({
      where: { editionId_schoolId: { editionId, schoolId: input.schoolId } },
      select: { id: true },
    });
    if (!registered) throw new Error("Register the school for this edition before adding its projects");
  }
  if (input.categoryId) {
    const category = await prisma.ksefCategory.findUnique({ where: { id: input.categoryId } });
    if (!category || category.editionId !== editionId) throw new Error("That category isn't part of this edition");
    if (!category.isActive) throw new Error(`${category.name} is disabled for this edition`);
  }
  if (input.subCategoryId) {
    const subCategory = await prisma.ksefSubCategory.findUnique({ where: { id: input.subCategoryId } });
    if (!subCategory || (input.categoryId && subCategory.categoryId !== input.categoryId)) {
      throw new Error("That sub-category doesn't belong to the chosen category");
    }
    if (!subCategory.isActive) throw new Error(`${subCategory.name} is disabled for this edition`);
  }
}
