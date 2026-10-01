import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { AuthorizationError, toErrorResponse } from "@/lib/authorize";
import {
  criteriaForDivision,
  evaluateDiscrepancy,
  getEditableEdition,
  requireKsefAdmin,
  requireOwnScoreSheet,
  requireScoreSheetViewer,
} from "@/lib/ksef";
import { ksefScoreSheetSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

/**
 * A score sheet. Its own judge sees it to fill in; the administrator and
 * (non-conflicted) Chief Judges can view it read-only. Other judges never see it.
 */
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { assignment, isOwnSheet } = await requireScoreSheetViewer(params.id);
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
      canEdit: isOwnSheet && !assignment.submittedAt && assignment.judge.edition.status !== "CLOSED",
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
 * Saves the judge's own scores (a draft until `submit`). Submitting needs a
 * score for every criterion on the sheet and makes the sheet permanent -
 * after that nobody can change it (enforced in the database too). Each
 * submission triggers the discrepancy check against the other judges.
 */
export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { ctx, assignment } = await requireOwnScoreSheet(params.id);
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
        // Still a draft here (requireOwnScoreSheet), so replacing draft scores is allowed.
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

    const reviewId = input.submit ? await evaluateDiscrepancy(assignment.projectId, assignment.level, ctx.userId) : null;
    return NextResponse.json({ saved: true, submitted: input.submit, flaggedForReview: !!reviewId });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/** Removes an assignment - only while the judge hasn't submitted (submitted sheets are permanent). */
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await requireKsefAdmin();
    const existing = await prisma.ksefJudgeAssignment.findUnique({ where: { id: params.id }, include: { judge: true } });
    if (!existing) throw new AuthorizationError("Assignment not found", 404);
    await getEditableEdition(existing.judge.editionId);
    if (existing.submittedAt) throw new Error("This judge has already submitted their score sheet - it's part of the permanent record");

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
