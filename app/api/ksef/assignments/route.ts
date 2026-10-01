import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { AuthorizationError, toErrorResponse } from "@/lib/authorize";
import { getEditableEdition, requireKsefAdmin } from "@/lib/ksef";
import { ksefAssignmentSchema, ksefLevelSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

/** ?editionId=&level= -> every judge assignment at that level. */
export async function GET(request: Request) {
  try {
    await requireKsefAdmin();
    const { searchParams } = new URL(request.url);
    const editionId = searchParams.get("editionId");
    const level = ksefLevelSchema.parse(searchParams.get("level"));
    if (!editionId) return NextResponse.json({ error: "editionId is required" }, { status: 400 });

    const assignments = await prisma.ksefJudgeAssignment.findMany({
      where: { level, project: { editionId } },
      include: {
        judge: { select: { id: true, user: { select: { name: true } } } },
        project: { select: { id: true, code: true, title: true } },
      },
      orderBy: [{ project: { code: "asc" } }, { createdAt: "asc" }],
    });
    return NextResponse.json({ assignments });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * Assigns a judge to projects at a level. Only submitted projects competing
 * at that level can be assigned; existing assignments are left as they are.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireKsefAdmin();
    const input = ksefAssignmentSchema.parse(await request.json());
    const judge = await prisma.ksefJudge.findUnique({ where: { id: input.judgeId } });
    if (!judge) throw new AuthorizationError("Judge not found", 404);
    if (!judge.isActive) throw new Error("This judge is deactivated - reactivate them first");
    await getEditableEdition(judge.editionId);

    const competing = await prisma.ksefResult.findMany({
      where: {
        level: input.level,
        projectId: { in: input.projectIds },
        project: { editionId: judge.editionId, status: "SUBMITTED" },
      },
      select: { projectId: true },
    });
    if (competing.length !== new Set(input.projectIds).size) {
      throw new Error("Some of those projects aren't submitted or aren't competing at this level");
    }

    const created = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "ksef_judge_assignments",
      mutate: (tx) =>
        tx.ksefJudgeAssignment.createMany({
          data: input.projectIds.map((projectId) => ({ judgeId: judge.id, projectId, level: input.level })),
          skipDuplicates: true,
        }),
      recordId: () => judge.id,
      newData: input,
    });
    return NextResponse.json({ assigned: created.count }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
