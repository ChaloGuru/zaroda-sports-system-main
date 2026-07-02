import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const existing = await prisma.schoolBibRange.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Bib range not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(existing.championshipId, ["TOURNAMENT_ADMIN"]);

    await withAudit({
      actorId: ctx.userId,
      operation: "DELETE",
      tableName: "school_bib_ranges",
      oldData: existing,
      mutate: (tx) => tx.schoolBibRange.delete({ where: { id: params.id } }),
      recordId: () => params.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
