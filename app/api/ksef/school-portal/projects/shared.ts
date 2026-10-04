import type { z } from "zod";
import type { KsefDivision, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { KSEF_DIVISION_LABELS } from "@/lib/ksef-config";
import { isOwnUploadUrl } from "@/lib/ksef-registration";
import type { ksefPortalProjectSchema } from "@/lib/validations";
import { assertProjectPlacement } from "../../projects/placement";

type PortalProjectInput = z.infer<typeof ksefPortalProjectSchema>;

/** Checks a school's project entry and turns it into the fields to save. */
export async function portalProjectData(registration: { editionId: string; divisions: KsefDivision[] }, input: PortalProjectInput) {
  await assertProjectPlacement(registration.editionId, { categoryId: input.categoryId, subCategoryId: input.subCategoryId });
  // A school only enters projects at the level(s) it registered for.
  if (registration.divisions.length > 0) {
    const category = await prisma.ksefCategory.findUnique({ where: { id: input.categoryId }, select: { division: true } });
    if (category && !registration.divisions.includes(category.division)) {
      throw new Error(`Your school registered for ${registration.divisions.map((d) => KSEF_DIVISION_LABELS[d]).join(" and ")} only`);
    }
  }
  if (input.documentUrl && !isOwnUploadUrl(input.documentUrl)) {
    throw new Error("Upload the project write-up as a PDF here rather than linking to it");
  }
  return {
    fields: {
      categoryId: input.categoryId,
      subCategoryId: input.subCategoryId ?? null,
      title: input.title,
      abstract: input.abstract ?? null,
      documentUrl: input.documentUrl ?? null,
    },
    learners: input.learners.map((l) => ({ ...l, grade: l.grade ?? null, upiNumber: l.upiNumber ?? null })),
    mentors: input.mentors.map((m) => ({ ...m, tscNumber: m.tscNumber ?? null, phone: m.phone ?? null, email: m.email ?? null })),
  };
}

export type PortalProjectData = Awaited<ReturnType<typeof portalProjectData>>;

/** Replaces a project's learners and mentors with the school's latest lists. */
export async function replacePeople(tx: Prisma.TransactionClient, projectId: string, data: PortalProjectData) {
  await tx.ksefLearner.deleteMany({ where: { projectId } });
  await tx.ksefLearner.createMany({ data: data.learners.map((l) => ({ ...l, projectId })) });
  await tx.ksefMentor.deleteMany({ where: { projectId } });
  await tx.ksefMentor.createMany({ data: data.mentors.map((m) => ({ ...m, projectId })) });
}
