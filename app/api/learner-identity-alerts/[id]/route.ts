import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { actorName } from "@/lib/learner-access";

export const dynamic = "force-dynamic";

const schema = z.object({
  reviewNote: z.string().trim().min(5, "Record what you found").max(1000).nullable(),
});

/**
 * A tournament admin of either record's championship marks an identity
 * alert as looked into, with what they found (e.g. "twins - both
 * certificates seen"). A null note reopens it.
 */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const alert = await prisma.learnerIdentityAlert.findUnique({
      where: { id: params.id },
      include: { learnerA: { select: { championshipId: true } }, learnerB: { select: { championshipId: true } } },
    });
    if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    let ctx;
    try {
      ctx = await requireChampionshipAccess(alert.learnerA.championshipId, ["TOURNAMENT_ADMIN"]);
    } catch (error) {
      if (alert.learnerB.championshipId === alert.learnerA.championshipId) throw error;
      ctx = await requireChampionshipAccess(alert.learnerB.championshipId, ["TOURNAMENT_ADMIN"]);
    }
    const { reviewNote } = schema.parse(await request.json());
    const data = reviewNote
      ? { reviewNote, reviewedBy: await actorName(ctx), reviewedAt: new Date() }
      : { reviewNote: null, reviewedBy: null, reviewedAt: null };

    await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "learner_identity_alerts",
      oldData: alert,
      mutate: (tx) => tx.learnerIdentityAlert.update({ where: { id: alert.id }, data, select: { id: true } }),
      recordId: () => alert.id,
      newData: data,
    });
    return NextResponse.json(data);
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
