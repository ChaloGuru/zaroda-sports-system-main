import { NextResponse } from "next/server";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { computeQualifiedAthletes } from "@/lib/qualified-athletes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const championshipId = searchParams.get("championshipId");
    if (!championshipId) return NextResponse.json({ error: "championshipId is required" }, { status: 400 });

    await requireChampionshipAccess(championshipId, ["TOURNAMENT_ADMIN", "SCOREKEEPER", "CHIEF_RECORDER"]);

    const gender = searchParams.get("gender") ?? undefined;
    const schoolLevel = searchParams.get("schoolLevel") ?? undefined;
    const groups = await computeQualifiedAthletes(championshipId, { gender, schoolLevel });

    return NextResponse.json({ groups });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
