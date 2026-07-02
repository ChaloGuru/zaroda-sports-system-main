import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { bibRangeSchema } from "@/lib/validations";
import { validateBibRangeNoOverlap } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const championshipId = searchParams.get("championshipId");
    if (!championshipId) return NextResponse.json({ error: "championshipId is required" }, { status: 400 });

    const ranges = await prisma.schoolBibRange.findMany({
      where: { championshipId },
      orderBy: { rangeStart: "asc" },
      include: { school: { select: { name: true } } },
    });

    return NextResponse.json({ ranges });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const input = bibRangeSchema.parse(body);
    const ctx = await requireChampionshipAccess(input.championshipId, ["TOURNAMENT_ADMIN"]);

    const otherRanges = await prisma.schoolBibRange.findMany({
      where: { championshipId: input.championshipId, schoolId: { not: input.schoolId } },
    });
    validateBibRangeNoOverlap(input, otherRanges);

    const range = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "school_bib_ranges",
      mutate: (tx) =>
        tx.schoolBibRange.upsert({
          where: { championshipId_schoolId: { championshipId: input.championshipId, schoolId: input.schoolId } },
          update: { rangeStart: input.rangeStart, rangeEnd: input.rangeEnd },
          create: {
            championshipId: input.championshipId,
            schoolId: input.schoolId,
            rangeStart: input.rangeStart,
            rangeEnd: input.rangeEnd,
          },
        }),
      recordId: (result) => result.id,
      newData: input,
    });

    return NextResponse.json({ range }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
