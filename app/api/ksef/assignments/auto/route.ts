import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { AuthorizationError, toErrorResponse } from "@/lib/authorize";
import { getEditableEdition, requireKsefAdmin } from "@/lib/ksef";
import { ASSIGNABLE_PANEL_ROLE, planAutoAssignments } from "@/lib/ksef-config";
import { ksefAutoAssignSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

/**
 * Automatic judge assignment: tops up every submitted project competing at a
 * level - for one school level (Junior / Senior) or all of them - to
 * `judgesPerProject` judges drawn from the chosen Judges, spreading the work
 * evenly (see planAutoAssignments). Existing assignments are kept, and Chief
 * Judges / SRC members are never given projects.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireKsefAdmin();
    const input = ksefAutoAssignSchema.parse(await request.json());
    await getEditableEdition(input.editionId);

    const judgeIds = Array.from(new Set(input.judgeIds));
    const judges = await prisma.ksefJudge.findMany({
      where: { id: { in: judgeIds } },
      include: { user: { select: { name: true } } },
    });
    if (judges.length !== judgeIds.length || judges.some((j) => j.editionId !== input.editionId)) {
      throw new AuthorizationError("Judge not found on this competition's panel", 404);
    }
    const unusable = judges.filter((j) => !j.isActive || j.role !== ASSIGNABLE_PANEL_ROLE);
    if (unusable.length > 0) {
      throw new Error(`${unusable.map((j) => j.user.name).join(", ")} can't be given projects - only active Judges can`);
    }

    const results = await prisma.ksefResult.findMany({
      where: {
        level: input.level,
        project: {
          editionId: input.editionId,
          status: "SUBMITTED",
          ...(input.division !== "ALL" ? { category: { division: input.division } } : {}),
        },
      },
      select: {
        projectId: true,
        project: {
          select: { code: true, assignments: { where: { level: input.level }, select: { judgeId: true } } },
        },
      },
      orderBy: { project: { code: "asc" } },
    });
    if (results.length === 0) throw new Error("No submitted projects are competing at this level for that school level");

    // Current load at this level, so earlier manual or automatic rounds count.
    const loads = await prisma.ksefJudgeAssignment.groupBy({
      by: ["judgeId"],
      where: { judgeId: { in: judgeIds }, level: input.level },
      _count: { _all: true },
    });
    const loadByJudge = new Map(loads.map((l) => [l.judgeId, l._count._all]));

    const plan = planAutoAssignments(
      results.map((r) => ({ id: r.projectId, judgeIds: r.project.assignments.map((a) => a.judgeId) })),
      judges.map((j) => ({ id: j.id, load: loadByJudge.get(j.id) ?? 0 })),
      input.judgesPerProject,
    );

    const created =
      plan.assignments.length === 0
        ? { count: 0 }
        : await withAudit({
            actorId: ctx.userId,
            operation: "INSERT",
            tableName: "ksef_judge_assignments",
            mutate: (tx) =>
              tx.ksefJudgeAssignment.createMany({
                data: plan.assignments.map((a) => ({ ...a, level: input.level })),
                skipDuplicates: true,
              }),
            recordId: () => input.editionId,
            newData: { ...input, auto: true, planned: plan.assignments.length },
          });

    const codeById = new Map(results.map((r) => [r.projectId, r.project.code]));
    return NextResponse.json({
      assigned: created.count,
      projects: results.length,
      shortfall: plan.shortfall.map((s) => ({ code: codeById.get(s.projectId), missing: s.missing })),
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
