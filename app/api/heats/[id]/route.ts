import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { timeInputSchema } from "@/lib/validations";
import { parseTimeToSeconds } from "@/lib/scoring";

export const dynamic = "force-dynamic";

const heatResultsSchema = z.object({
  results: z
    .array(
      z.object({
        participantId: z.string().uuid(),
        timeInput: timeInputSchema.optional(),
        score: z.number().optional(),
        position: z.number().int().positive().optional(),
      }),
    )
    .min(1),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const heat = await prisma.heat.findUnique({ where: { id: params.id }, include: { game: true } });
    if (!heat) return NextResponse.json({ error: "Heat not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(heat.game.championshipId, ["TOURNAMENT_ADMIN", "SCOREKEEPER"]);

    const body: unknown = await request.json();
    const input = heatResultsSchema.parse(body);

    const maxQualifiers = heat.game.maxQualifiers;
    const ranked = [...input.results]
      .filter((r) => r.position !== undefined)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const qualifyingIds = new Set(ranked.slice(0, maxQualifiers).map((r) => r.participantId));

    const updated = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "heat_participants",
      oldData: { heatId: params.id },
      mutate: async (tx) => {
        const rows = [];
        for (const result of input.results) {
          const row = await tx.heatParticipant.update({
            where: { heatId_participantId: { heatId: params.id, participantId: result.participantId } },
            data: {
              timeTaken: result.timeInput ? parseTimeToSeconds(result.timeInput) : undefined,
              score: result.score,
              position: result.position,
              isQualifiedForFinal: qualifyingIds.has(result.participantId),
            },
          });
          rows.push(row);
        }
        return rows;
      },
      recordId: () => params.id,
      newData: input,
    });

    return NextResponse.json({ results: updated });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const heat = await prisma.heat.findUnique({ where: { id: params.id }, include: { game: true } });
    if (!heat) return NextResponse.json({ error: "Heat not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(heat.game.championshipId, ["TOURNAMENT_ADMIN"]);

    await withAudit({
      actorId: ctx.userId,
      operation: "DELETE",
      tableName: "heats",
      oldData: heat,
      mutate: (tx) => tx.heat.delete({ where: { id: params.id } }),
      recordId: () => params.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
