import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/authorize";
import { requireKsefAdmin } from "@/lib/ksef";

export const dynamic = "force-dynamic";

// Panel members join by accepting an invitation (app/api/ksef/invites) -
// they set their own password; the administrator never does.
export async function GET(request: Request) {
  try {
    await requireKsefAdmin();
    const editionId = new URL(request.url).searchParams.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId is required" }, { status: 400 });

    const judges = await prisma.ksefJudge.findMany({
      where: { editionId },
      orderBy: { user: { name: "asc" } },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        assignments: { select: { id: true, level: true, submittedAt: true } },
      },
    });
    return NextResponse.json({
      judges: judges.map(({ assignments, ...j }) => ({
        ...j,
        assignedCount: assignments.length,
        submittedCount: assignments.filter((a) => a.submittedAt).length,
      })),
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
