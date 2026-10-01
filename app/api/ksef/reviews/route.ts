import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthorizationError, isSuperAdmin, requireAuth, toErrorResponse } from "@/lib/authorize";
import { getPanelMember } from "@/lib/ksef";

export const dynamic = "force-dynamic";

/**
 * ?editionId= -> the edition's judging discrepancy reviews. For the KSEF
 * administrator and the edition's Chief Judges. A Chief Judge sees reviews
 * of projects they're judging themselves, marked as conflicted, but can't
 * open them.
 */
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const editionId = new URL(request.url).searchParams.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId is required" }, { status: 400 });
    if (!isSuperAdmin(ctx)) {
      const member = await getPanelMember(ctx.userId, editionId);
      if (member?.role !== "CHIEF_JUDGE") throw new AuthorizationError("Only a Chief Judge can see judging discrepancy reviews");
    }

    const reviews = await prisma.ksefDiscrepancyReview.findMany({
      where: { project: { editionId } },
      orderBy: [{ status: "asc" }, { detectedAt: "desc" }],
      include: {
        approvedBy: { select: { name: true } },
        project: {
          select: {
            id: true,
            code: true,
            title: true,
            status: true,
            category: { select: { name: true, division: true } },
            school: { select: { name: true } },
            assignments: { select: { level: true, judge: { select: { userId: true } } } },
          },
        },
      },
    });

    return NextResponse.json({
      reviews: reviews.map(({ project: { assignments, ...project }, ...r }) => ({
        ...r,
        spread: Number(r.spread),
        threshold: Number(r.threshold),
        finalScore: r.finalScore === null ? null : Number(r.finalScore),
        conflict: !isSuperAdmin(ctx) && assignments.some((a) => a.level === r.level && a.judge.userId === ctx.userId),
        project,
      })),
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
