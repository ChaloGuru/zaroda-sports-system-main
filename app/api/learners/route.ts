import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, canViewChampionshipPrivateData, toErrorResponse } from "@/lib/authorize";
import { ageDateOf } from "@/lib/learners";

export const dynamic = "force-dynamic";

/**
 * A championship's registered learners (optionally one school's), with the
 * events each is entered in - for entering a learner in another event and
 * for identity checks. Officials only; photos are fetched separately.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const championshipId = searchParams.get("championshipId");
    const schoolId = searchParams.get("schoolId");
    if (!championshipId) return NextResponse.json({ error: "championshipId is required" }, { status: 400 });

    const championship = await prisma.championship.findUnique({ where: { id: championshipId }, select: { id: true, tenantId: true, registrationClosesAt: true, ageCutoffDate: true, startDate: true } });
    if (!championship) return NextResponse.json({ error: "Championship not found" }, { status: 404 });
    if (!canViewChampionshipPrivateData(await getAuthContext(), championship)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const learners = await prisma.learner.findMany({
      where: { championshipId, ...(schoolId ? { schoolId } : {}) },
      orderBy: [{ bibNumber: "asc" }],
      select: {
        id: true,
        schoolId: true,
        firstName: true,
        lastName: true,
        gender: true,
        dateOfBirth: true,
        birthCertNumber: true,
        bibNumber: true,
        photoUpdatedAt: true,
        school: { select: { name: true } },
        participants: { select: { gameId: true, game: { select: { name: true, maxAge: true } } } },
      },
    });
    return NextResponse.json({
      learners,
      rules: { registrationClosesAt: championship.registrationClosesAt, ageDate: ageDateOf(championship) },
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
