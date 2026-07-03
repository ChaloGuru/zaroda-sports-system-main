import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isSuperAdmin, hasRole, toErrorResponse } from "@/lib/authorize";
import { computeChampionshipTeamStandings } from "@/lib/team-standings";

export const dynamic = "force-dynamic";

interface MedalRow {
  entityName: string;
  gold: number;
  silver: number;
  bronze: number;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const championshipId = searchParams.get("championshipId");
    if (!championshipId) return NextResponse.json({ error: "championshipId is required" }, { status: 400 });

    const championship = await prisma.championship.findUnique({ where: { id: championshipId } });
    if (!championship) return NextResponse.json({ error: "Championship not found" }, { status: 404 });

    if (!championship.isPublished) {
      const ctx = await getAuthContext();
      const owns = ctx && (isSuperAdmin(ctx) || (hasRole(ctx, "TENANT_OWNER") && ctx.tenantId === championship.tenantId));
      if (!owns) return NextResponse.json({ error: "Championship not found" }, { status: 404 });
    }

    const participants = await prisma.participant.findMany({
      where: { championshipId, position: { in: [1, 2, 3] } },
      include: {
        school: { select: { id: true, name: true } },
        tournamentTeam: { select: { id: true, name: true } },
      },
    });

    // Keyed by organization name (trimmed/lowercased), not by School/
    // TournamentTeam id: the same real-world institution gets a *separate*
    // TournamentTeam row per ball game it enters (see the bulk "Add
    // organizations" flow in TeamsPanel), so keying by id split one
    // institution's medals across multiple rows whenever it medaled in more
    // than one game - the exact "same institution appears twice" bug.
    const rows = new Map<string, MedalRow>();
    function addMedal(rawName: string, medal: "gold" | "silver" | "bronze") {
      const key = rawName.trim().toLowerCase();
      if (!key) return;
      if (!rows.has(key)) {
        rows.set(key, { entityName: rawName.trim(), gold: 0, silver: 0, bronze: 0 });
      }
      (rows.get(key) as MedalRow)[medal]++;
    }

    for (const p of participants) {
      const name = p.school?.name ?? p.tournamentTeam?.name;
      if (!name) continue;
      if (p.position === 1) addMedal(name, "gold");
      else if (p.position === 2) addMedal(name, "silver");
      else if (p.position === 3) addMedal(name, "bronze");
    }

    // Ball-games/indoor-games team fixtures don't produce Participant rows,
    // so a team's game-topping finish would otherwise never earn a medal.
    // A game only counts once at least one of its fixtures has been played
    // (there's no explicit "pool concluded" flag on Game/MatchPool yet).
    const teamStandings = await computeChampionshipTeamStandings(championshipId);
    for (const game of teamStandings) {
      const played = game.standings.filter((s) => s.played > 0);
      if (played.length === 0) continue;

      const medalPositions: Array<"gold" | "silver" | "bronze"> = ["gold", "silver", "bronze"];
      played.slice(0, 3).forEach((row, index) => {
        const medal = medalPositions[index];
        if (!medal) return;
        addMedal(row.teamName, medal);
      });
    }

    const medalTable = Array.from(rows.values())
      .sort((a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze)
      .map((row, index) => ({ ...row, entityId: row.entityName, position: index + 1, total: row.gold + row.silver + row.bronze }));

    return NextResponse.json({ medalTable });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
