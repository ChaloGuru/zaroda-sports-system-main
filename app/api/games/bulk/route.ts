import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { gameBulkActionSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

/**
 * Activate, deactivate or delete several games of one championship at once -
 * mainly for trimming the auto-created standard event list (see
 * lib/default-games.ts) down to what a championship actually runs.
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const input = gameBulkActionSchema.parse(body);
    const ctx = await requireChampionshipAccess(input.championshipId, ["TOURNAMENT_ADMIN"]);

    // Only ever touch games that really belong to this championship, so the
    // access check above covers every row affected.
    const games = await prisma.game.findMany({
      where: { id: { in: input.gameIds }, championshipId: input.championshipId },
    });
    if (games.length !== new Set(input.gameIds).size) {
      return NextResponse.json({ error: "Some games were not found in this championship" }, { status: 404 });
    }
    const ids = games.map((g) => g.id);

    const affected = await withAudit({
      actorId: ctx.userId,
      operation: input.action === "delete" ? "DELETE" : "UPDATE",
      tableName: "games",
      oldData: games,
      mutate: async (tx) => {
        if (input.action === "delete") return (await tx.game.deleteMany({ where: { id: { in: ids } } })).count;
        return (
          await tx.game.updateMany({ where: { id: { in: ids } }, data: { isActive: input.action === "activate" } })
        ).count;
      },
      recordId: () => input.championshipId,
      newData: input,
    });

    return NextResponse.json({ affected });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
