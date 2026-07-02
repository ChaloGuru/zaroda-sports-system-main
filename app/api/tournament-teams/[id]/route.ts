import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { tournamentTeamSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

const tournamentTeamUpdateSchema = tournamentTeamSchema.partial();

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const existing = await prisma.tournamentTeam.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Team not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(existing.championshipId, ["TOURNAMENT_ADMIN"]);

    const body: unknown = await request.json();
    const input = tournamentTeamUpdateSchema.parse(body);

    const updated = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "tournament_teams",
      oldData: existing,
      mutate: (tx) =>
        tx.tournamentTeam.update({
          where: { id: params.id },
          data: input,
        }),
      recordId: () => params.id,
      newData: input,
    });

    return NextResponse.json({ team: updated });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "That team code is already used in this championship" }, { status: 409 });
    }
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const existing = await prisma.tournamentTeam.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Team not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(existing.championshipId, ["TOURNAMENT_ADMIN"]);

    await withAudit({
      actorId: ctx.userId,
      operation: "DELETE",
      tableName: "tournament_teams",
      oldData: existing,
      mutate: (tx) => tx.tournamentTeam.delete({ where: { id: params.id } }),
      recordId: () => params.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Foreign key constraint")) {
      return NextResponse.json(
        { error: "This team has registered participants or fixtures - remove those first" },
        { status: 409 },
      );
    }
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
