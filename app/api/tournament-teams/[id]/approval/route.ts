import { NextResponse } from "next/server";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, requireGameAccess, toErrorResponse } from "@/lib/authorize";
import { actorName } from "@/lib/learner-access";

export const dynamic = "force-dynamic";

const APPROVER_ROLES: Role[] = ["TOURNAMENT_ADMIN", "GAME_COORDINATOR"];

const schema = z.object({ approved: z.boolean() });

/**
 * An official records that they've vetted a team and approved it to play,
 * which locks its list - or takes that back so it can change again. Who and
 * when are kept, and audited.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const team = await prisma.tournamentTeam.findUnique({
      where: { id: params.id },
      select: { id: true, championshipId: true, gameId: true, approvedAt: true, approvedBy: true },
    });
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
    const ctx = team.gameId
      ? await requireGameAccess(team.gameId, APPROVER_ROLES)
      : await requireChampionshipAccess(team.championshipId, ["TOURNAMENT_ADMIN"]);
    const { approved } = schema.parse(await request.json());

    if (approved) {
      const players = await prisma.participant.count({ where: { tournamentTeamId: team.id } });
      if (players === 0) return NextResponse.json({ error: "Add the team's players before approving it" }, { status: 400 });
    }

    const data = approved
      ? { approvedAt: new Date(), approvedBy: await actorName(ctx) }
      : { approvedAt: null, approvedBy: null };
    await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "tournament_teams",
      oldData: { approvedAt: team.approvedAt, approvedBy: team.approvedBy },
      mutate: (tx) => tx.tournamentTeam.update({ where: { id: team.id }, data, select: { id: true } }),
      recordId: () => team.id,
      newData: data,
    });
    return NextResponse.json(data);
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
