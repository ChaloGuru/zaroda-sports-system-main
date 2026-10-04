import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/authorize";
import { applyOfficialScoreSheet, getEditableEdition, requireKsefAdmin } from "@/lib/ksef";
import { ksefDivisionSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

/** ?editionId=&division= -> how many of that school level's score sheets were already submitted (warned about before switching). */
export async function GET(request: Request) {
  try {
    await requireKsefAdmin();
    const { searchParams } = new URL(request.url);
    const editionId = searchParams.get("editionId");
    const division = ksefDivisionSchema.parse(searchParams.get("division"));
    if (!editionId) return NextResponse.json({ error: "editionId is required" }, { status: 400 });
    const submitted = await prisma.ksefJudgeAssignment.count({
      where: { submittedAt: { not: null }, project: { editionId, category: { division } } },
    });
    return NextResponse.json({ submitted });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/** Switches the edition's projects at one school level to that level's official KSEF score sheet. */
export async function POST(request: Request) {
  try {
    const ctx = await requireKsefAdmin();
    const { editionId, division } = z.object({ editionId: z.string().uuid(), division: ksefDivisionSchema }).parse(await request.json());
    await getEditableEdition(editionId);
    return NextResponse.json(await applyOfficialScoreSheet(editionId, division, ctx.userId));
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
