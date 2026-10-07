import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { CALL_ROOM_ROLES, actorName } from "@/lib/learner-access";

export const dynamic = "force-dynamic";

const schema = z.object({ verified: z.boolean() });

/**
 * An official records that they've seen the learner's original birth
 * certificate (or KNEC record) and it matches the learner in front of
 * them - or takes that back. Who and when are kept, and audited.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const learner = await prisma.learner.findUnique({
      where: { id: params.id },
      select: { id: true, championshipId: true, documentsVerifiedAt: true, documentsVerifiedBy: true },
    });
    if (!learner) return NextResponse.json({ error: "Learner not found" }, { status: 404 });
    const ctx = await requireChampionshipAccess(learner.championshipId, CALL_ROOM_ROLES);
    const { verified } = schema.parse(await request.json());

    const data = verified
      ? { documentsVerifiedAt: new Date(), documentsVerifiedBy: await actorName(ctx) }
      : { documentsVerifiedAt: null, documentsVerifiedBy: null };
    await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "learners",
      oldData: { documentsVerifiedAt: learner.documentsVerifiedAt, documentsVerifiedBy: learner.documentsVerifiedBy },
      mutate: (tx) => tx.learner.update({ where: { id: learner.id }, data, select: { id: true } }),
      recordId: () => learner.id,
      newData: data,
    });
    return NextResponse.json(data);
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
