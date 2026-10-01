import { cookies } from "next/headers";
import type { KsefEdition, KsefDivision, Level, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { AuthorizationError, requireAuth, requireRole, isSuperAdmin, type AuthContext } from "./authorize";
import {
  STANDARD_KSEF_STRUCTURE,
  averageJudgeTotal,
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

/** Throws unless the caller is the judge on this assignment (or the super admin). */
export async function requireAssignmentJudge(assignmentId: string) {
  const ctx = await requireAuth();
  const assignment = await prisma.ksefJudgeAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      judge: { include: { edition: true } },
      project: { include: { category: { select: { division: true } } } },
    },
  });
  if (!assignment) throw new AuthorizationError("Assignment not found", 404);
  if (!isSuperAdmin(ctx) && (assignment.judge.userId !== ctx.userId || !assignment.judge.isActive)) {
    throw new AuthorizationError("This project isn't assigned to you");
  }
  assertEditionEditable(assignment.judge.edition);
  return { ctx, assignment };
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
      sortOrder: index,
      isActive: "isActive" in c ? (c.isActive as boolean) : true,
    })),
  });
}

/**
 * Recomputes every result at `level`: each project's total is the average
 * of its judges' submitted score-sheet totals, ranked within its category
 * and geographic unit. Ranks and scores are refreshed; qualification
 * status is only decided when the level is published.
 */
export async function calculateLevelResults(editionId: string, level: Level) {
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
        },
      },
    },
  });

  const computed = results.map((r) => {
    const totals = r.project.assignments.map((a) => a.scores.reduce((sum, s) => sum + Number(s.score), 0));
    return {
      id: r.id,
      unit: competitionUnit(level, r.project.school),
      categoryId: r.project.categoryId,
      totalScore: averageJudgeTotal(totals),
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
export async function publishLevelResults(edition: KsefEdition, level: Level) {
  await calculateLevelResults(edition.id, level);
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
