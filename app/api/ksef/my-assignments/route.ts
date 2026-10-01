import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, toErrorResponse } from "@/lib/authorize";

export const dynamic = "force-dynamic";

// The signed-in judge's assigned projects. Only Active editions are open for
// judging - a Draft edition's assignments stay hidden until it's activated.
export async function GET() {
  try {
    const ctx = await requireAuth();
    const assignments = await prisma.ksefJudgeAssignment.findMany({
      where: { judge: { userId: ctx.userId, isActive: true, edition: { status: "ACTIVE" } } },
      include: {
        judge: { select: { edition: { select: { id: true, name: true } } } },
        project: {
          select: {
            code: true,
            title: true,
            category: { select: { name: true, division: true } },
            school: { select: { name: true } },
          },
        },
      },
      orderBy: [{ submittedAt: { sort: "asc", nulls: "first" } }, { project: { code: "asc" } }],
    });
    return NextResponse.json({ assignments });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
