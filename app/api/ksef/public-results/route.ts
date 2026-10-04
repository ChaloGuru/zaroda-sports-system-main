import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/authorize";
import { KSEF_LEVELS, competitionUnit } from "@/lib/ksef-config";
import { ksefLevelSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

/**
 * Public KSEF results - only what the administrator has published.
 *
 * No params -> the editions with published results, and which of their levels.
 * ?editionId=&level= -> that level's published results: project, learners'
 * names, school, final score, rank and whether it qualified. Never learners'
 * UPI numbers/gender/grade, mentors, abstracts or uploaded documents.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const editionId = searchParams.get("editionId");

    if (!editionId) {
      const rows = await prisma.ksefResult.findMany({
        where: { isPublished: true, project: { status: "SUBMITTED" } },
        select: { level: true, project: { select: { editionId: true } } },
      });
      const editions = await prisma.ksefEdition.findMany({
        where: { id: { in: Array.from(new Set(rows.map((r) => r.project.editionId))) } },
        select: { id: true, name: true, year: true },
        orderBy: { year: "desc" },
      });
      return NextResponse.json({
        editions: editions.map((e) => ({
          ...e,
          levels: KSEF_LEVELS.filter((level) => rows.some((r) => r.project.editionId === e.id && r.level === level)),
        })),
      });
    }

    const level = ksefLevelSchema.parse(searchParams.get("level"));
    const results = await prisma.ksefResult.findMany({
      where: { level, isPublished: true, project: { editionId, status: "SUBMITTED" } },
      select: {
        id: true,
        totalScore: true,
        rank: true,
        status: true,
        publishedAt: true,
        project: {
          select: {
            code: true,
            title: true,
            school: { select: { name: true, subcounty: true, county: true, region: true } },
            category: { select: { id: true, name: true, division: true, sortOrder: true } },
            subCategory: { select: { name: true } },
            learners: { select: { firstName: true, lastName: true }, orderBy: { createdAt: "asc" } },
          },
        },
      },
    });

    return NextResponse.json({
      results: results.map((r) => ({
        id: r.id,
        code: r.project.code,
        title: r.project.title,
        learners: r.project.learners.map((l) => `${l.firstName} ${l.lastName}`),
        school: r.project.school.name,
        unit: competitionUnit(level, r.project.school),
        category: r.project.category,
        subCategory: r.project.subCategory?.name ?? null,
        totalScore: r.totalScore === null ? null : Number(r.totalScore),
        rank: r.rank,
        qualified: r.status === "QUALIFIED",
        publishedAt: r.publishedAt,
      })),
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
