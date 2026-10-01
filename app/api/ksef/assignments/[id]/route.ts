import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { AuthorizationError, toErrorResponse } from "@/lib/authorize";
import { criteriaForDivision, getEditableEdition, requireAssignmentJudge, requireKsefAdmin } from "@/lib/ksef";
import { ksefScoreSheetSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

/** The judge's score sheet for one assigned project. */
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { assignment } = await requireAssignmentJudge(params.id);
    const [project, criteria, scores] = await Promise.all([
      prisma.ksefProject.findUnique({
        where: { id: assignment.projectId },
        select: {
          id: true,
          code: true,
          title: true,
          abstract: true,
          documentUrl: true,
          category: { select: { name: true, division: true } },
          subCategory: { select: { name: true } },
          school: { select: { name: true } },
          learners: { select: { firstName: true, lastName: true, grade: true } },
        },
      }),
      criteriaForDivision(assignment.judge.editionId, assignment.project.category.division),
      prisma.ksefScore.findMany({ where: { assignmentId: assignment.id } }),
    ]);
    return NextResponse.json({
      assignment: {
        id: assignment.id,
        level: assignment.level,
        comment: assignment.comment,
        submittedAt: assignment.submittedAt,
      },
      project,
      criteria,
      scores: scores.map((s) => ({ criterionId: s.criterionId, score: Number(s.score) })),
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * Saves the judge's scores (a draft until `submit`). Submitting needs a
 * score for every criterion on the sheet, and locks the sheet - only
 * submitted sheets count towards results.
 */
export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { ctx, assignment } = await requireAssignmentJudge(params.id);
    if (assignment.submittedAt) throw new Error("This score sheet has already been submitted");
    const input = ksefScoreSheetSchema.parse(await request.json());

    const criteria = await criteriaForDivision(assignment.judge.editionId, assignment.project.category.division);
    const byId = new Map(criteria.map((c) => [c.id, c]));
    for (const s of input.scores) {
      const criterion = byId.get(s.criterionId);
      if (!criterion) throw new Error("A score was given for a criterion that isn't on this score sheet");
      if (s.score > criterion.maxScore) throw new Error(`${criterion.name} is out of ${criterion.maxScore}`);
    }
    if (input.submit) {
      const scored = new Set(input.scores.map((s) => s.criterionId));
      const missing = criteria.filter((c) => !scored.has(c.id));
      if (missing.length > 0) throw new Error(`Score every criterion before submitting - missing: ${missing.map((c) => c.name).join(", ")}`);
    }

    await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "ksef_judge_assignments",
      mutate: async (tx) => {
        await tx.ksefScore.deleteMany({ where: { assignmentId: assignment.id } });
        await tx.ksefScore.createMany({
          data: input.scores.map((s) => ({ assignmentId: assignment.id, criterionId: s.criterionId, score: s.score })),
        });
        return tx.ksefJudgeAssignment.update({
          where: { id: assignment.id },
          data: { comment: input.comment ?? null, ...(input.submit ? { submittedAt: new Date() } : {}) },
        });
      },
      recordId: (result) => result.id,
      newData: input,
    });
    return NextResponse.json({ saved: true, submitted: input.submit });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * Admin actions on an assignment: DELETE removes it (only before the judge
 * submits); POST ?action=reopen unlocks a submitted sheet for correction.
 */
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await requireKsefAdmin();
    const existing = await prisma.ksefJudgeAssignment.findUnique({ where: { id: params.id }, include: { judge: true } });
    if (!existing) throw new AuthorizationError("Assignment not found", 404);
    await getEditableEdition(existing.judge.editionId);
    if (existing.submittedAt) throw new Error("This judge has already submitted scores - reopen the sheet instead of removing it");

    await withAudit({
      actorId: ctx.userId,
      operation: "DELETE",
      tableName: "ksef_judge_assignments",
      oldData: existing,
      mutate: (tx) => tx.ksefJudgeAssignment.delete({ where: { id: existing.id } }),
      recordId: (result) => result.id,
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await requireKsefAdmin();
    if (new URL(request.url).searchParams.get("action") !== "reopen") throw new Error("Unknown action");
    const existing = await prisma.ksefJudgeAssignment.findUnique({ where: { id: params.id }, include: { judge: true } });
    if (!existing) throw new AuthorizationError("Assignment not found", 404);
    await getEditableEdition(existing.judge.editionId);

    const published = await prisma.ksefResult.count({
      where: { projectId: existing.projectId, level: existing.level, isPublished: true },
    });
    if (published > 0) throw new Error("Results for this level are already published - this sheet can't be reopened");

    await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "ksef_judge_assignments",
      oldData: { submittedAt: existing.submittedAt },
      mutate: (tx) => tx.ksefJudgeAssignment.update({ where: { id: existing.id }, data: { submittedAt: null } }),
      recordId: (result) => result.id,
      newData: { submittedAt: null },
    });
    return NextResponse.json({ reopened: true });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
