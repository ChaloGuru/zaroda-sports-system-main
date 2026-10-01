import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthorizationError, isSuperAdmin, toErrorResponse } from "@/lib/authorize";
import { assertEditionEditable, criteriaForDivision, recordCaseEvent, requireChiefJudgeFor } from "@/lib/ksef";
import { averageJudgeTotal } from "@/lib/ksef-config";
import { ksefReviewActionSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

async function loadReview(id: string) {
  const review = await prisma.ksefDiscrepancyReview.findUnique({
    where: { id },
    include: { project: { select: { id: true, editionId: true, edition: true, category: { select: { division: true } } } } },
  });
  if (!review) throw new AuthorizationError("Review not found", 404);
  return review;
}

/** Every judge's original, unaltered score sheet for the project side by side, plus the review's history. */
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const review = await loadReview(params.id);
    await requireChiefJudgeFor(review.project.editionId, review.projectId, review.level);

    const [project, criteria, assignments, events] = await Promise.all([
      prisma.ksefProject.findUnique({
        where: { id: review.projectId },
        select: {
          code: true,
          title: true,
          abstract: true,
          documentUrl: true,
          category: { select: { name: true, division: true } },
          subCategory: { select: { name: true } },
          school: { select: { name: true, subcounty: true, county: true } },
          learners: { select: { firstName: true, lastName: true } },
        },
      }),
      criteriaForDivision(review.project.editionId, review.project.category.division),
      prisma.ksefJudgeAssignment.findMany({
        where: { projectId: review.projectId, level: review.level },
        orderBy: { submittedAt: "asc" },
        include: {
          judge: { select: { specialty: true, user: { select: { name: true } } } },
          scores: { include: { criterion: { select: { id: true, name: true, maxScore: true } } } },
        },
      }),
      prisma.ksefCaseEvent.findMany({
        where: { reviewId: review.id },
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { name: true } } },
      }),
    ]);

    const sheets = assignments.map((a) => ({
      id: a.id,
      judgeName: a.judge.user.name,
      specialty: a.judge.specialty,
      submittedAt: a.submittedAt,
      comment: a.submittedAt ? a.comment : null,
      scores: a.submittedAt ? a.scores.map((s) => ({ criterionId: s.criterionId, criterion: s.criterion.name, maxScore: s.criterion.maxScore, score: Number(s.score) })) : [],
      total: a.submittedAt ? a.scores.reduce((sum, s) => sum + Number(s.score), 0) : null,
    }));
    const submittedTotals = sheets.flatMap((s) => (s.total === null ? [] : [s.total]));
    // The current sheet's criteria, plus any a judge scored that has since
    // been disabled - so every original score stays visible.
    const rows = new Map(criteria.map((c) => [c.id, { id: c.id, name: c.name, maxScore: c.maxScore }]));
    for (const sheet of sheets) {
      for (const s of sheet.scores) if (!rows.has(s.criterionId)) rows.set(s.criterionId, { id: s.criterionId, name: s.criterion, maxScore: s.maxScore });
    }

    return NextResponse.json({
      review: {
        id: review.id,
        level: review.level,
        status: review.status,
        spread: Number(review.spread),
        threshold: Number(review.threshold),
        basis: review.basis,
        detectedAt: review.detectedAt,
        finalScoreBasis: review.finalScoreBasis,
        finalScore: review.finalScore === null ? null : Number(review.finalScore),
        approvedAt: review.approvedAt,
      },
      editionClosed: review.project.edition.status === "CLOSED",
      project,
      criteria: Array.from(rows.values()),
      maxTotal: criteria.reduce((sum, c) => sum + c.maxScore, 0),
      sheets,
      averageOfJudges: averageJudgeTotal(submittedTotals),
      events: events.map((e) => ({ id: e.id, action: e.action, note: e.note, actor: e.actor?.name ?? "System", createdAt: e.createdAt })),
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * Chief Judge actions - each one is appended to the review's timeline and
 * the audit log; none touches any judge's scores.
 * - NOTE: record a review note.
 * - APPROVE: approve the final result with a resolution note - either the
 *   average of all submitted judge totals, or a final score the Chief Judge
 *   determined (justified in the note).
 * - REOPEN: reopen an approved review. Once the level's result for this
 *   project is published, only the KSEF administrator may do this, and it
 *   withdraws the published result until it's re-published.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const review = await loadReview(params.id);
    const ctx = await requireChiefJudgeFor(review.project.editionId, review.projectId, review.level);
    assertEditionEditable(review.project.edition);
    const input = ksefReviewActionSchema.parse(await request.json());

    if (input.action === "NOTE") {
      await prisma.$transaction(async (tx) => {
        await recordCaseEvent(tx, { reviewId: review.id, actorId: ctx.userId, action: "NOTE", note: input.note });
        await tx.auditLog.create({
          data: { changedBy: ctx.userId, operation: "INSERT", tableName: "ksef_case_events", recordId: review.id, newData: input },
        });
      });
      return NextResponse.json({ ok: true });
    }

    if (input.action === "APPROVE") {
      if (review.status !== "OPEN") throw new Error("This review is already approved - reopen it first to change the decision");
      const submitted = await prisma.ksefJudgeAssignment.findMany({
        where: { projectId: review.projectId, level: review.level, submittedAt: { not: null } },
        select: { scores: { select: { score: true } } },
      });
      const totals = submitted.map((a) => a.scores.reduce((sum, s) => sum + Number(s.score), 0));
      const maxTotal = (await criteriaForDivision(review.project.editionId, review.project.category.division)).reduce((sum, c) => sum + c.maxScore, 0);

      let finalScore: number;
      if (input.finalScoreBasis === "AVERAGE_OF_JUDGES") {
        const average = averageJudgeTotal(totals);
        if (average === null) throw new Error("No judge has submitted a score sheet for this project");
        finalScore = average;
      } else {
        if (input.finalScore === undefined) throw new Error("Enter the final score you've determined");
        if (input.finalScore > maxTotal) throw new Error(`The final score can't exceed the score sheet maximum of ${maxTotal}`);
        finalScore = Math.round(input.finalScore * 100) / 100;
      }

      await prisma.$transaction(async (tx) => {
        await tx.ksefDiscrepancyReview.update({
          where: { id: review.id },
          data: { status: "APPROVED", finalScoreBasis: input.finalScoreBasis, finalScore, approvedById: ctx.userId, approvedAt: new Date() },
        });
        await recordCaseEvent(tx, {
          reviewId: review.id,
          actorId: ctx.userId,
          action: "APPROVED",
          note: `${input.finalScoreBasis === "AVERAGE_OF_JUDGES" ? `Final result approved as the average of ${totals.length} judges' totals` : "Final result determined by the Chief Judge"}: ${finalScore}. ${input.note}`,
        });
        await tx.auditLog.create({
          data: {
            changedBy: ctx.userId,
            operation: "UPDATE",
            tableName: "ksef_discrepancy_reviews",
            recordId: review.id,
            oldData: { status: review.status },
            newData: { ...input, finalScore, judgeTotals: totals },
          },
        });
      });
      return NextResponse.json({ ok: true, finalScore });
    }

    // REOPEN
    if (review.status !== "APPROVED") throw new Error("Only an approved review can be reopened");
    const publishedResult = await prisma.ksefResult.findFirst({
      where: { projectId: review.projectId, level: review.level, isPublished: true },
    });
    if (publishedResult && !isSuperAdmin(ctx)) {
      throw new AuthorizationError("This result is already published - only the KSEF administrator can reopen its review");
    }
    await prisma.$transaction(async (tx) => {
      await tx.ksefDiscrepancyReview.update({
        where: { id: review.id },
        data: { status: "OPEN", finalScoreBasis: null, finalScore: null, approvedById: null, approvedAt: null },
      });
      if (publishedResult) {
        await tx.ksefResult.update({ where: { id: publishedResult.id }, data: { isPublished: false, status: "PENDING" } });
      }
      await recordCaseEvent(tx, {
        reviewId: review.id,
        actorId: ctx.userId,
        action: "REOPENED",
        note: `Previous approved final result: ${review.finalScore === null ? "-" : Number(review.finalScore)}.${publishedResult ? " The published result has been withdrawn until re-published." : ""} ${input.note}`,
      });
      await tx.auditLog.create({
        data: {
          changedBy: ctx.userId,
          operation: "UPDATE",
          tableName: "ksef_discrepancy_reviews",
          recordId: review.id,
          oldData: { status: review.status, finalScore: review.finalScore, finalScoreBasis: review.finalScoreBasis },
          newData: { ...input, withdrewPublishedResult: !!publishedResult },
        },
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
