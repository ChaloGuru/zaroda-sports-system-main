import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/authorize";
import { applyOfficialJuniorScoreSheet, getEditableEdition, requireKsefAdmin } from "@/lib/ksef";

export const dynamic = "force-dynamic";

/** ?editionId= -> how many Junior School score sheets were already submitted (warned about before switching). */
export async function GET(request: Request) {
  try {
    await requireKsefAdmin();
    const editionId = new URL(request.url).searchParams.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId is required" }, { status: 400 });
    const submitted = await prisma.ksefJudgeAssignment.count({
      where: { submittedAt: { not: null }, project: { editionId, category: { division: "JUNIOR_SCHOOL" } } },
    });
    return NextResponse.json({ submitted });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/** Switches the edition's Junior School projects to the official KSEF Junior School score sheet. */
export async function POST(request: Request) {
  try {
    const ctx = await requireKsefAdmin();
    const { editionId } = z.object({ editionId: z.string().uuid() }).parse(await request.json());
    await getEditableEdition(editionId);
    return NextResponse.json(await applyOfficialJuniorScoreSheet(editionId, ctx.userId));
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
