import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { toErrorResponse } from "@/lib/authorize";
import { getEditableEdition, requireKsefAdmin } from "@/lib/ksef";
import { ksefProjectSchema } from "@/lib/validations";
import { assertProjectPlacement } from "./placement";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireKsefAdmin();
    const editionId = new URL(request.url).searchParams.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId is required" }, { status: 400 });

    const projects = await prisma.ksefProject.findMany({
      where: { editionId },
      orderBy: [{ code: "asc" }, { createdAt: "asc" }],
      include: {
        school: { select: { id: true, name: true, subcounty: true, county: true, region: true } },
        category: { select: { id: true, name: true, division: true } },
        subCategory: { select: { id: true, name: true } },
        learners: { orderBy: { createdAt: "asc" } },
        mentors: { orderBy: { createdAt: "asc" } },
        _count: { select: { assignments: true } },
      },
    });
    return NextResponse.json({ projects });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/** Registers a project (as a draft) with its learners and mentor(s). */
export async function POST(request: Request) {
  try {
    const ctx = await requireKsefAdmin();
    const input = ksefProjectSchema.parse(await request.json());
    await getEditableEdition(input.editionId);
    await assertProjectPlacement(input.editionId, input);

    const project = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "ksef_projects",
      mutate: (tx) =>
        tx.ksefProject.create({
          data: {
            editionId: input.editionId,
            schoolId: input.schoolId,
            categoryId: input.categoryId,
            subCategoryId: input.subCategoryId ?? null,
            title: input.title,
            abstract: input.abstract ?? null,
            documentUrl: input.documentUrl ?? null,
            learners: {
              create: input.learners.map((l) => ({ ...l, grade: l.grade ?? null, upiNumber: l.upiNumber ?? null })),
            },
            mentors: {
              create: input.mentors.map((m) => ({
                ...m,
                tscNumber: m.tscNumber ?? null,
                phone: m.phone ?? null,
                email: m.email ?? null,
              })),
            },
          },
        }),
      recordId: (result) => result.id,
      newData: input,
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
