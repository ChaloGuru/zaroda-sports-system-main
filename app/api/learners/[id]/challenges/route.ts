import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { CALL_ROOM_ROLES, actorName } from "@/lib/learner-access";

export const dynamic = "force-dynamic";

const schema = z.object({ reason: z.string().trim().min(5, "Say why you're challenging this learner").max(1000) });

/**
 * An official challenges a learner's age or identity. Until a tournament
 * admin resolves it the learner can't be checked in, and any check-in
 * already done is undone - they're held back from the track.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const learner = await prisma.learner.findUnique({ where: { id: params.id }, select: { id: true, championshipId: true } });
    if (!learner) return NextResponse.json({ error: "Learner not found" }, { status: 404 });
    const ctx = await requireChampionshipAccess(learner.championshipId, CALL_ROOM_ROLES);
    const { reason } = schema.parse(await request.json());
    const open = await prisma.learnerChallenge.findFirst({ where: { learnerId: learner.id, status: "OPEN" }, select: { id: true } });
    if (open) return NextResponse.json({ error: "This learner already has an open challenge" }, { status: 409 });
    const raisedBy = await actorName(ctx);

    const challenge = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "learner_challenges",
      mutate: async (tx) => {
        await tx.participant.updateMany({
          where: { learnerId: learner.id, status: "CONFIRMED_IN_CALL_ROOM" },
          data: { status: "REGISTERED" },
        });
        return tx.learnerChallenge.create({ data: { learnerId: learner.id, reason, raisedBy } });
      },
      recordId: (c) => c.id,
      newData: { learnerId: learner.id, reason, raisedBy },
    });
    return NextResponse.json({ challenge }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
