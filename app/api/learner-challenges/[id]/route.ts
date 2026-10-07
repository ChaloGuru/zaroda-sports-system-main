import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { actorName } from "@/lib/learner-access";

export const dynamic = "force-dynamic";

const schema = z.object({
  status: z.enum(["CLEARED", "UPHELD"]),
  resolution: z.string().trim().min(5, "Record what was checked and decided").max(1000),
});

/**
 * A tournament admin resolves a challenge after checking the original
 * documents: cleared (the learner can be checked in again) or upheld (every
 * one of the learner's entries is disqualified).
 */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const challenge = await prisma.learnerChallenge.findUnique({
      where: { id: params.id },
      include: { learner: { select: { id: true, championshipId: true } } },
    });
    if (!challenge) return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    const ctx = await requireChampionshipAccess(challenge.learner.championshipId, ["TOURNAMENT_ADMIN"]);
    const input = schema.parse(await request.json());
    if (challenge.status !== "OPEN") return NextResponse.json({ error: "This challenge has already been resolved" }, { status: 409 });
    const resolvedBy = await actorName(ctx);

    const updated = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "learner_challenges",
      oldData: challenge,
      mutate: async (tx) => {
        if (input.status === "UPHELD") {
          await tx.participant.updateMany({ where: { learnerId: challenge.learnerId }, data: { status: "DISQUALIFIED" } });
        }
        return tx.learnerChallenge.update({
          where: { id: challenge.id },
          data: { status: input.status, resolution: input.resolution, resolvedBy, resolvedAt: new Date() },
        });
      },
      recordId: (c) => c.id,
      newData: { ...input, resolvedBy },
    });
    return NextResponse.json({ challenge: updated });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
