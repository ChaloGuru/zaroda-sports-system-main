import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/authorize";
import {
  calculateLevelResults,
  getEditableEdition,
  progressQualifiedProjects,
  publishLevelResults,
  requireKsefAdmin,
} from "@/lib/ksef";
import { competitionUnit } from "@/lib/ksef-config";
import { ksefLevelActionSchema, ksefLevelSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

/** ?editionId=&level= -> every project competing at that level with its result. */
export async function GET(request: Request) {
  try {
    await requireKsefAdmin();
    const { searchParams } = new URL(request.url);
    const editionId = searchParams.get("editionId");
    const level = ksefLevelSchema.parse(searchParams.get("level"));
    if (!editionId) return NextResponse.json({ error: "editionId is required" }, { status: 400 });

    const results = await prisma.ksefResult.findMany({
      where: { level, project: { editionId } },
      include: {
        project: {
          select: {
            id: true,
            code: true,
            title: true,
            status: true,
            school: { select: { name: true, subcounty: true, county: true, region: true } },
            category: { select: { id: true, name: true, division: true } },
            subCategory: { select: { name: true } },
            learners: { select: { firstName: true, lastName: true } },
            assignments: { where: { level }, select: { submittedAt: true } },
          },
        },
      },
    });

    return NextResponse.json({
      results: results.map((r) => ({
        id: r.id,
        totalScore: r.totalScore === null ? null : Number(r.totalScore),
        judgeCount: r.judgeCount,
        rank: r.rank,
        status: r.status,
        isPublished: r.isPublished,
        unit: competitionUnit(level, r.project.school),
        assignedJudges: r.project.assignments.length,
        submittedJudges: r.project.assignments.filter((a) => a.submittedAt).length,
        project: { ...r.project, assignments: undefined },
      })),
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * CALCULATE: refresh totals and ranks from submitted score sheets.
 * PUBLISH: calculate, then fix who qualified and make the level's results official.
 * PROGRESS: move the level's qualifiers up to the next level.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireKsefAdmin();
    const input = ksefLevelActionSchema.parse(await request.json());
    const edition = await getEditableEdition(input.editionId);
    if (!edition.levels.includes(input.level)) throw new Error("That level isn't part of this edition");

    let outcome: Record<string, unknown>;
    switch (input.action) {
      case "CALCULATE":
        outcome = { calculated: await calculateLevelResults(edition.id, input.level) };
        break;
      case "PUBLISH":
        outcome = { published: await publishLevelResults(edition, input.level) };
        break;
      case "PROGRESS":
        outcome = await progressQualifiedProjects(edition, input.level);
        break;
    }

    // These touch many rows in their own transactions, so they're audited
    // as one summary entry rather than through withAudit.
    await prisma.auditLog.create({
      data: {
        changedBy: ctx.userId,
        operation: "UPDATE",
        tableName: "ksef_results",
        recordId: edition.id,
        newData: { ...input, ...outcome },
      },
    });
    return NextResponse.json(outcome);
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
