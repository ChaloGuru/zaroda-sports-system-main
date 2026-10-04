import { cookies } from "next/headers";
import type { KsefEdition, KsefDivision, Level, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { AuthorizationError, requireAuth, requireRole, isSuperAdmin, type AuthContext } from "./authorize";
import {
  KSEF_OFFICIAL_SCORE_SHEETS,
  STANDARD_KSEF_STRUCTURE,
  averageJudgeTotal,
  checkJudgeDiscrepancy,
  competitionUnit,
  nextKsefLevel,
  rankKsefResults,
} from "./ksef-config";

/** Cookie holding the edition picked in the KSEF section's "Select Competition" control. */
export const KSEF_EDITION_COOKIE = "ksef_edition";

/** KSEF is administered platform-wide by the super admin. */
export function requireKsefAdmin(): Promise<AuthContext> {
  return requireRole(["SUPER_ADMIN"]);
}

export async function getEditionOrThrow(editionId: string): Promise<KsefEdition> {
  const edition = await prisma.ksefEdition.findUnique({ where: { id: editionId } });
  if (!edition) throw new AuthorizationError("KSEF edition not found", 404);
  return edition;
}

/** Closed editions are history - nothing in them may change. */
export function assertEditionEditable(edition: Pick<KsefEdition, "status" | "name">): void {
  if (edition.status === "CLOSED") {
    throw new AuthorizationError(`${edition.name} is closed - reopen it in Competitions before making changes`, 409);
  }
}

/** Loads an edition for a write, throwing if it's closed. */
export async function getEditableEdition(editionId: string): Promise<KsefEdition> {
  const edition = await getEditionOrThrow(editionId);
  assertEditionEditable(edition);
  return edition;
}

/**
 * The edition the KSEF pages should show: the one picked in "Select
 * Competition" (cookie), else the latest ACTIVE edition, else the latest
 * edition of any status. Null when no edition exists yet.
 */
export async function resolveSelectedEdition(): Promise<KsefEdition | null> {
  const picked = (await cookies()).get(KSEF_EDITION_COOKIE)?.value;
  if (picked) {
    const edition = await prisma.ksefEdition.findUnique({ where: { id: picked } });
    if (edition) return edition;
  }
  return (
    (await prisma.ksefEdition.findFirst({ where: { status: "ACTIVE" }, orderBy: { year: "desc" } })) ??
    (await prisma.ksefEdition.findFirst({ orderBy: { year: "desc" } }))
  );
}

function loadAssignment(assignmentId: string) {
  return prisma.ksefJudgeAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      judge: { include: { edition: true } },
      project: { include: { category: { select: { division: true } } } },
    },
  });
}

/**
 * Who may *read* a score sheet: its own judge, the KSEF administrator, or
 * one of the edition's Chief Judges who isn't judging that project. Judges
 * never see each other's sheets - scoring stays independent.
 */
export async function requireScoreSheetViewer(assignmentId: string) {
  const ctx = await requireAuth();
  const assignment = await loadAssignment(assignmentId);
  if (!assignment) throw new AuthorizationError("Assignment not found", 404);
  const isOwnSheet = assignment.judge.userId === ctx.userId && assignment.judge.isActive;
  if (!isOwnSheet && !isSuperAdmin(ctx)) {
    const chief = await getPanelMember(ctx.userId, assignment.judge.editionId);
    const conflicted = await isAssignedToProject(ctx.userId, assignment.projectId, assignment.level);
    if (chief?.role !== "CHIEF_JUDGE" || conflicted) throw new AuthorizationError("This score sheet isn't available to you");
  }
  return { ctx, assignment, isOwnSheet };
}

/**
 * Only the assigned judge may write their own score sheet - not the
 * administrator, not a Chief Judge - and only until it's submitted.
 */
export async function requireOwnScoreSheet(assignmentId: string) {
  const ctx = await requireAuth();
  const assignment = await loadAssignment(assignmentId);
  if (!assignment) throw new AuthorizationError("Assignment not found", 404);
  if (assignment.judge.userId !== ctx.userId || !assignment.judge.isActive) {
    throw new AuthorizationError("Only the assigned judge can enter scores on this sheet");
  }
  assertEditionEditable(assignment.judge.edition);
  if (assignment.judge.edition.status !== "ACTIVE") {
    throw new AuthorizationError(`Judging for ${assignment.judge.edition.name} opens once the KSEF administrator activates it`, 409);
  }
  if (assignment.submittedAt) throw new AuthorizationError("This score sheet has been submitted and can no longer be changed", 409);
  return { ctx, assignment };
}

/** The caller's active panel membership (judge / chief judge / SRC member) in an edition. */
export function getPanelMember(userId: string, editionId: string) {
  return prisma.ksefJudge.findFirst({ where: { userId, editionId, isActive: true } });
}

/** True if the user is a judge on this project at this level (a conflict of interest for reviewing it). */
export async function isAssignedToProject(userId: string, projectId: string, level: Level): Promise<boolean> {
  return (await prisma.ksefJudgeAssignment.count({ where: { projectId, level, judge: { userId } } })) > 0;
}

/**
 * Throws unless the caller may act as Chief Judge for this project: the
 * KSEF administrator, or an active Chief Judge of the edition who isn't
 * judging the project themselves.
 */
export async function requireChiefJudgeFor(editionId: string, projectId: string, level: Level): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (isSuperAdmin(ctx)) return ctx;
  const member = await getPanelMember(ctx.userId, editionId);
  if (member?.role !== "CHIEF_JUDGE") throw new AuthorizationError("Only a Chief Judge can review judging discrepancies");
  if (await isAssignedToProject(ctx.userId, projectId, level)) {
    throw new AuthorizationError("You're judging this project, so another Chief Judge must review it");
  }
  return ctx;
}

/** Appends to a review's or complaint's permanent timeline. */
export function recordCaseEvent(
  tx: Prisma.TransactionClient,
  event: { reviewId?: string; complaintId?: string; actorId: string | null; action: string; note?: string | null },
) {
  return tx.ksefCaseEvent.create({
    data: {
      reviewId: event.reviewId ?? null,
      complaintId: event.complaintId ?? null,
      actorId: event.actorId,
      action: event.action,
      note: event.note ?? null,
    },
  });
}

/** Sum of the maximum scores on a project's score sheet. */
async function scoreSheetMaxTotal(editionId: string, division: KsefDivision): Promise<number> {
  const criteria = await criteriaForDivision(editionId, division);
  return criteria.reduce((sum, c) => sum + c.maxScore, 0);
}

/**
 * Compares a project's submitted judge totals at a level against the
 * edition's discrepancy threshold. A significant discrepancy opens a Chief
 * Judge review (or reopens an approved one if a new sheet has arrived
 * since). Judge scores themselves are only read, never touched. Returns
 * the review id if one is open, else null.
 */
export async function evaluateDiscrepancy(projectId: string, level: Level, actorId: string | null): Promise<string | null> {
  const project = await prisma.ksefProject.findUnique({
    where: { id: projectId },
    select: {
      editionId: true,
      category: { select: { division: true } },
      edition: { select: { discrepancyThreshold: true, discrepancyBasis: true } },
      assignments: {
        where: { level, submittedAt: { not: null } },
        select: { submittedAt: true, scores: { select: { score: true } } },
      },
      reviews: { where: { level } },
    },
  });
  if (!project || project.edition.discrepancyThreshold === null) return null;

  const totals = project.assignments.map((a) => a.scores.reduce((sum, s) => sum + Number(s.score), 0));
  const check = checkJudgeDiscrepancy(totals, {
    threshold: Number(project.edition.discrepancyThreshold),
    basis: project.edition.discrepancyBasis,
    maxTotal: await scoreSheetMaxTotal(project.editionId, project.category.division),
  });
  const existing = project.reviews[0];
  if (!check) return existing?.status === "OPEN" ? existing.id : null;

  const snapshot = {
    spread: check.spread,
    threshold: Number(project.edition.discrepancyThreshold),
    basis: project.edition.discrepancyBasis,
  };

  if (!existing) {
    if (!check.exceeds) return null;
    const review = await prisma.$transaction(async (tx) => {
      const created = await tx.ksefDiscrepancyReview.create({ data: { projectId, level, ...snapshot } });
      await recordCaseEvent(tx, {
        reviewId: created.id,
        actorId,
        action: "DETECTED",
        note: `Judge totals differ by ${check.spread} marks (threshold ${check.thresholdMarks} marks).`,
      });
      await tx.auditLog.create({
        data: { changedBy: actorId, operation: "INSERT", tableName: "ksef_discrepancy_reviews", recordId: created.id, newData: { projectId, level, ...snapshot } },
      });
      return created;
    });
    return review.id;
  }

  // An approval only covers the sheets it saw - a sheet submitted after it
  // (e.g. from an extra judge) puts the project back under review.
  const newSheetSinceApproval =
    existing.status === "APPROVED" &&
    existing.approvedAt !== null &&
    project.assignments.some((a) => a.submittedAt && a.submittedAt > existing.approvedAt!);

  await prisma.$transaction(async (tx) => {
    await tx.ksefDiscrepancyReview.update({
      where: { id: existing.id },
      data: { ...snapshot, ...(newSheetSinceApproval ? { status: "OPEN" } : {}) },
    });
    if (newSheetSinceApproval) {
      await recordCaseEvent(tx, {
        reviewId: existing.id,
        actorId,
        action: "REOPENED",
        note: `A new score sheet was submitted after approval - judge totals now differ by ${check.spread} marks.`,
      });
      await tx.auditLog.create({
        data: { changedBy: actorId, operation: "UPDATE", tableName: "ksef_discrepancy_reviews", recordId: existing.id, newData: { status: "OPEN", reason: "new sheet after approval" } },
      });
    }
  });
  return newSheetSinceApproval || existing.status === "OPEN" ? existing.id : null;
}

/** Criteria on the score sheet for a project in `division`. */
export function criteriaForDivision(editionId: string, division: KsefDivision) {
  return prisma.ksefCriterion.findMany({
    where: { editionId, isActive: true, OR: [{ division: null }, { division }] },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export type ConfigSource = { kind: "STANDARD" } | { kind: "EMPTY" } | { kind: "COPY"; fromEditionId: string };

/**
 * Fills a newly created edition's categories, sub-categories and criteria.
 * A copy is a deep copy into new rows, so later edits to either edition
 * never affect the other. Projects, schools, judges, scores and results are
 * never copied.
 */
export async function seedEditionConfig(tx: Prisma.TransactionClient, editionId: string, source: ConfigSource) {
  if (source.kind === "EMPTY") return;

  const template =
    source.kind === "STANDARD"
      ? STANDARD_KSEF_STRUCTURE
      : await (async () => {
          const from = await tx.ksefEdition.findUnique({
            where: { id: source.fromEditionId },
            include: {
              categories: { include: { subCategories: true }, orderBy: { sortOrder: "asc" } },
              criteria: { orderBy: { sortOrder: "asc" } },
            },
          });
          if (!from) throw new AuthorizationError("The edition to copy from wasn't found", 404);
          return {
            categories: from.categories.map((c) => ({
              division: c.division,
              name: c.name,
              isActive: c.isActive,
              subCategories: c.subCategories.map((s) => s.name),
            })),
            criteria: from.criteria.map((c) => ({ ...c, description: c.description ?? "" })),
          };
        })();

  for (const [index, category] of template.categories.entries()) {
    await tx.ksefCategory.create({
      data: {
        editionId,
        division: category.division,
        name: category.name,
        sortOrder: index,
        isActive: "isActive" in category ? (category.isActive as boolean) : true,
        subCategories: { create: category.subCategories.map((name, i) => ({ name, sortOrder: i })) },
      },
    });
  }
  await tx.ksefCriterion.createMany({
    data: template.criteria.map((c, index) => ({
      editionId,
      division: c.division,
      name: c.name,
      description: c.description || null,
      maxScore: c.maxScore,
      section: c.section ?? null,
      levelScored: c.levelScored ?? false,
      sortOrder: index,
      isActive: "isActive" in c ? (c.isActive as boolean) : true,
    })),
  });
}

/**
 * Switches an edition's projects at one school level to that level's
 * official KSEF score sheet. Criteria that applied to that level are kept
 * for the record (submitted sheets still reference them) but stop applying:
 * ones for that level only are disabled, and ones shared with the other level
 * become the other level's only. Returns how many of that level's score
 * sheets were already submitted on the old criteria, so the administrator
 * can have those projects re-judged.
 */
export async function applyOfficialScoreSheet(editionId: string, division: KsefDivision, actorId: string) {
  const sheet = KSEF_OFFICIAL_SCORE_SHEETS[division];
  const other: KsefDivision = division === "JUNIOR_SCHOOL" ? "SENIOR_SCHOOL" : "JUNIOR_SCHOOL";
  const existing = await prisma.ksefCriterion.findMany({ where: { editionId, isActive: true, OR: [{ division: null }, { division }] } });
  if (existing.some((c) => c.division === division && c.levelScored && c.section?.startsWith("Part A"))) {
    throw new Error("This school level already uses the official KSEF score sheet");
  }
  const submittedOnOld = await prisma.ksefJudgeAssignment.count({
    where: { submittedAt: { not: null }, project: { editionId, category: { division } } },
  });
  const nextSort = (await prisma.ksefCriterion.aggregate({ where: { editionId }, _max: { sortOrder: true } }))._max.sortOrder ?? 0;

  await prisma.$transaction(async (tx) => {
    await tx.ksefCriterion.updateMany({ where: { editionId, isActive: true, division }, data: { isActive: false } });
    await tx.ksefCriterion.updateMany({ where: { editionId, isActive: true, division: null }, data: { division: other } });
    await tx.ksefCriterion.createMany({
      data: sheet.map((c, i) => ({
        editionId,
        division,
        section: c.section ?? null,
        name: c.name,
        description: c.description || null,
        maxScore: c.maxScore,
        levelScored: true,
        sortOrder: nextSort + 1 + i,
      })),
    });
    await tx.auditLog.create({
      data: {
        changedBy: actorId,
        operation: "UPDATE",
        tableName: "ksef_criteria",
        recordId: editionId,
        oldData: { division, criteria: existing.map((c) => ({ id: c.id, name: c.name, division: c.division })) },
        newData: { officialScoreSheet: division, criteria: sheet.length },
      },
    });
  });
  return { submittedOnOld };
}

/**
 * Recomputes every result at `level`: each project's total is the average
 * of its judges' submitted score-sheet totals, ranked within its category
 * and geographic unit. Ranks and scores are refreshed; qualification
 * status is only decided when the level is published.
 */
export async function calculateLevelResults(editionId: string, level: Level, actorId: string | null = null) {
  // Re-check discrepancies first - the threshold may have changed since the
  // sheets came in.
  const competing = await prisma.ksefResult.findMany({
    where: { level, project: { editionId, status: "SUBMITTED" } },
    select: { projectId: true },
  });
  for (const { projectId } of competing) await evaluateDiscrepancy(projectId, level, actorId);

  const results = await prisma.ksefResult.findMany({
    where: { level, project: { editionId, status: "SUBMITTED" } },
    include: {
      project: {
        select: {
          id: true,
          categoryId: true,
          school: { select: { subcounty: true, county: true, region: true } },
          assignments: {
            where: { level, submittedAt: { not: null } },
            select: { scores: { select: { score: true } } },
          },
          reviews: { where: { level }, select: { status: true, finalScore: true } },
        },
      },
    },
  });

  const computed = results.map((r) => {
    const totals = r.project.assignments.map((a) => a.scores.reduce((sum, s) => sum + Number(s.score), 0));
    // A Chief Judge's approved final result stands in for the plain average
    // (which is still what an approval "AVERAGE_OF_JUDGES" records).
    const review = r.project.reviews[0];
    const approvedScore = review?.status === "APPROVED" && review.finalScore !== null ? Number(review.finalScore) : null;
    return {
      id: r.id,
      unit: competitionUnit(level, r.project.school),
      categoryId: r.project.categoryId,
      totalScore: approvedScore ?? averageJudgeTotal(totals),
      judgeCount: totals.length,
    };
  });
  const ranks = rankKsefResults(computed);

  await prisma.$transaction(
    computed.map((c) =>
      prisma.ksefResult.update({
        where: { id: c.id },
        data: { totalScore: c.totalScore, judgeCount: c.judgeCount, rank: ranks.get(c.id) ?? null },
      }),
    ),
  );
  return computed.length;
}

/**
 * Publishes a level's results: recalculates, then marks the top
 * `qualifiersPerCategory` in each category/unit as QUALIFIED (none qualify
 * past the top level) and the rest NOT_QUALIFIED.
 */
export async function publishLevelResults(edition: KsefEdition, level: Level, actorId: string | null = null) {
  if (edition.discrepancyThreshold === null) {
    throw new Error(
      "Set the judging discrepancy threshold (Competitions → Settings) from this year's KSEF rules before publishing results",
    );
  }
  await calculateLevelResults(edition.id, level, actorId);
  const openReviews = await prisma.ksefDiscrepancyReview.count({
    where: { level, status: "OPEN", project: { editionId: edition.id, status: "SUBMITTED" } },
  });
  if (openReviews > 0) {
    throw new Error(
      `${openReviews} project${openReviews === 1 ? " has" : "s have"} a judging discrepancy awaiting Chief Judge review - results can't be published until ${openReviews === 1 ? "it is" : "they are"} approved`,
    );
  }
  const isTopLevel = nextKsefLevel(edition.levels, level) === null;
  const results = await prisma.ksefResult.findMany({
    where: { level, project: { editionId: edition.id, status: "SUBMITTED" } },
    select: { id: true, rank: true },
  });
  const now = new Date();
  await prisma.$transaction(
    results.map((r) =>
      prisma.ksefResult.update({
        where: { id: r.id },
        data: {
          status: !isTopLevel && r.rank !== null && r.rank <= edition.qualifiersPerCategory ? "QUALIFIED" : "NOT_QUALIFIED",
          isPublished: true,
          publishedAt: now,
        },
      }),
    ),
  );
  return results.length;
}

/**
 * Moves every QUALIFIED project at `level` up to the next level (creating
 * its pending result there) and makes that the edition's current level.
 */
export async function progressQualifiedProjects(edition: KsefEdition, level: Level) {
  const next = nextKsefLevel(edition.levels, level);
  if (!next) throw new Error("This is already the final level - there's no next level to progress to");

  const qualified = await prisma.ksefResult.findMany({
    where: { level, status: "QUALIFIED", isPublished: true, project: { editionId: edition.id, status: "SUBMITTED" } },
    select: { projectId: true },
  });
  if (qualified.length === 0) throw new Error("No published qualifiers at this level yet - publish the results first");

  await prisma.$transaction([
    ...qualified.map((q) =>
      prisma.ksefResult.upsert({
        where: { projectId_level: { projectId: q.projectId, level: next } },
        create: { projectId: q.projectId, level: next },
        update: {},
      }),
    ),
    prisma.ksefProject.updateMany({
      where: { id: { in: qualified.map((q) => q.projectId) } },
      data: { currentLevel: next },
    }),
    prisma.ksefEdition.update({ where: { id: edition.id }, data: { currentLevel: next } }),
  ]);
  return { progressed: qualified.length, nextLevel: next };
}
