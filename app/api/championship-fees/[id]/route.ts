import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";

export const dynamic = "force-dynamic";

const championshipFeeUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  amountKes: z.number().int().min(0).optional(),
  isRequired: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const existing = await prisma.championshipFee.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Fee not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(existing.championshipId, ["TOURNAMENT_ADMIN"]);

    const body: unknown = await request.json();
    const input = championshipFeeUpdateSchema.parse(body);

    const updated = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "championship_fees",
      oldData: existing,
      mutate: (tx) => tx.championshipFee.update({ where: { id: params.id }, data: input }),
      recordId: () => params.id,
      newData: input,
    });

    return NextResponse.json({ fee: updated });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const existing = await prisma.championshipFee.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Fee not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(existing.championshipId, ["TOURNAMENT_ADMIN"]);

    await withAudit({
      actorId: ctx.userId,
      operation: "DELETE",
      tableName: "championship_fees",
      oldData: existing,
      mutate: (tx) => tx.championshipFee.delete({ where: { id: params.id } }),
      recordId: () => params.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
