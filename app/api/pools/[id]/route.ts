import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";

export const dynamic = "force-dynamic";

const poolUpdateSchema = z.object({ name: z.string().min(1).max(100) });

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const existing = await prisma.pool.findUnique({ where: { id: params.id }, include: { game: true } });
    if (!existing) return NextResponse.json({ error: "Pool not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(existing.game.championshipId, ["TOURNAMENT_ADMIN"]);
    const body: unknown = await request.json();
    const input = poolUpdateSchema.parse(body);

    const updated = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "pools",
      oldData: existing,
      mutate: (tx) => tx.pool.update({ where: { id: params.id }, data: { name: input.name } }),
      recordId: () => params.id,
      newData: input,
    });

    return NextResponse.json({ pool: updated });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/** Teams in the pool are not deleted - their poolId is cleared (onDelete: SetNull). */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const existing = await prisma.pool.findUnique({ where: { id: params.id }, include: { game: true } });
    if (!existing) return NextResponse.json({ error: "Pool not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(existing.game.championshipId, ["TOURNAMENT_ADMIN"]);

    await withAudit({
      actorId: ctx.userId,
      operation: "DELETE",
      tableName: "pools",
      oldData: existing,
      mutate: (tx) => tx.pool.delete({ where: { id: params.id } }),
      recordId: () => params.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
