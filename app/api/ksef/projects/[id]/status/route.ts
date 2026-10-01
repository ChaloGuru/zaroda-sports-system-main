import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { AuthorizationError, toErrorResponse } from "@/lib/authorize";
import { getEditableEdition, requireKsefAdmin } from "@/lib/ksef";

export const dynamic = "force-dynamic";

const statusActionSchema = z.object({ action: z.enum(["SUBMIT", "RETURN_TO_DRAFT", "WITHDRAW", "REINSTATE"]) });

const CODE_PREFIX = { JUNIOR_SCHOOL: "J", SENIOR_SCHOOL: "S" } as const;

/**
 * Moves a project through its lifecycle:
 * - SUBMIT: needs at least one learner and a mentor. Assigns the project
 *   code (J-0001 / S-0001, per edition) and enters it at the edition's first
 *   level, ready for judging.
 * - RETURN_TO_DRAFT: undo a submission, only while no judge has submitted a
 *   score sheet for it.
 * - WITHDRAW / REINSTATE: take a submitted project out of (or back into)
 *   judging and results without losing its data.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await requireKsefAdmin();
    const { action } = statusActionSchema.parse(await request.json());
    const project = await prisma.ksefProject.findUnique({
      where: { id: params.id },
      include: {
        category: { select: { division: true } },
        _count: { select: { learners: true, mentors: true } },
      },
    });
    if (!project) throw new AuthorizationError("Project not found", 404);
    const edition = await getEditableEdition(project.editionId);

    let data: { status: "DRAFT" | "SUBMITTED" | "WITHDRAWN"; code?: string; submittedAt?: Date | null; currentLevel?: (typeof edition.levels)[number] };
    switch (action) {
      case "SUBMIT": {
        if (project.status !== "DRAFT") throw new Error("Only a draft project can be submitted");
        if (project._count.learners === 0) throw new Error("Add at least one learner before submitting");
        if (project._count.mentors === 0) throw new Error("Add the project's mentor before submitting");
        const firstLevel = edition.levels[0];
        if (!firstLevel) throw new Error("This edition has no competition levels configured");
        let code = project.code;
        if (!code) {
          const prefix = `${CODE_PREFIX[project.category.division]}-`;
          const existingCodes = await prisma.ksefProject.findMany({
            where: { editionId: project.editionId, code: { startsWith: prefix } },
            select: { code: true },
          });
          const highest = Math.max(0, ...existingCodes.map((p) => Number(p.code?.slice(prefix.length)) || 0));
          code = `${prefix}${String(highest + 1).padStart(4, "0")}`;
        }
        data = { status: "SUBMITTED", code, submittedAt: new Date(), currentLevel: firstLevel };
        break;
      }
      case "RETURN_TO_DRAFT": {
        if (project.status !== "SUBMITTED") throw new Error("Only a submitted project can be returned to draft");
        const judged = await prisma.ksefJudgeAssignment.count({ where: { projectId: project.id, submittedAt: { not: null } } });
        if (judged > 0) throw new Error("Judges have already scored this project - withdraw it instead");
        data = { status: "DRAFT", submittedAt: null };
        break;
      }
      case "WITHDRAW":
        if (project.status !== "SUBMITTED") throw new Error("Only a submitted project can be withdrawn");
        data = { status: "WITHDRAWN" };
        break;
      case "REINSTATE":
        if (project.status !== "WITHDRAWN") throw new Error("Only a withdrawn project can be reinstated");
        data = { status: "SUBMITTED" };
        break;
    }

    const updated = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "ksef_projects",
      oldData: { status: project.status, code: project.code },
      mutate: async (tx) => {
        if (action === "SUBMIT") {
          await tx.ksefResult.upsert({
            where: { projectId_level: { projectId: project.id, level: data.currentLevel! } },
            create: { projectId: project.id, level: data.currentLevel! },
            update: {},
          });
        }
        if (action === "RETURN_TO_DRAFT") {
          await tx.ksefResult.deleteMany({ where: { projectId: project.id } });
          await tx.ksefJudgeAssignment.deleteMany({ where: { projectId: project.id } });
        }
        return tx.ksefProject.update({ where: { id: project.id }, data });
      },
      recordId: (result) => result.id,
      newData: { action, ...data },
    });
    return NextResponse.json({ project: updated });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
