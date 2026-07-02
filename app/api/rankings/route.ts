import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isSuperAdmin, hasRole, toErrorResponse } from "@/lib/authorize";
import { pointsForPosition } from "@/lib/scoring";
import { computeChampionshipTeamStandings } from "@/lib/team-standings";

export const dynamic = "force-dynamic";

interface RankingRow {
  entityId: string;
  entityName: string;
  boysTrack: number;
  boysField: number;
  girlsTrack: number;
  girlsField: number;
  mixedTotal: number;
}

/**
 * Aggregate standings for a championship, matching the county/regional
 * summary format: Track / Field / Grand Total, split Boys / Girls / Total,
 * filterable by school level (PRIMARY_JS | SENIOR_SCHOOL | TERTIARY | OVERALL).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const championshipId = searchParams.get("championshipId");
    const schoolLevelParam = searchParams.get("schoolLevel"); // PRIMARY_JS | SENIOR_SCHOOL | TERTIARY | null=OVERALL
    if (!championshipId) return NextResponse.json({ error: "championshipId is required" }, { status: 400 });

    const championship = await prisma.championship.findUnique({ where: { id: championshipId } });
    if (!championship) return NextResponse.json({ error: "Championship not found" }, { status: 404 });

    if (!championship.isPublished) {
      const ctx = await getAuthContext();
      const owns = ctx && (isSuperAdmin(ctx) || (hasRole(ctx, "TENANT_OWNER") && ctx.tenantId === championship.tenantId));
      if (!owns) return NextResponse.json({ error: "Championship not found" }, { status: 404 });
    }

    const participants = await prisma.participant.findMany({
      where: { championshipId, position: { not: null } },
      include: {
        game: { select: { schoolLevel: true, isTimed: true } },
        school: { select: { id: true, name: true } },
        tournamentTeam: { select: { id: true, name: true } },
      },
    });

    const rows = new Map<string, RankingRow>();

    for (const p of participants) {
      const entityId = p.schoolId ?? p.tournamentTeamId;
      if (!entityId || p.position === null) continue;

      const matchesLevel =
        !schoolLevelParam || schoolLevelParam === "OVERALL" || p.game.schoolLevel === schoolLevelParam;
      if (!matchesLevel) continue;

      const points = pointsForPosition(p.position);
      if (points === 0) continue;

      if (!rows.has(entityId)) {
        rows.set(entityId, {
          entityId,
          entityName: p.school?.name ?? p.tournamentTeam?.name ?? "Unknown",
          boysTrack: 0,
          boysField: 0,
          girlsTrack: 0,
          girlsField: 0,
          mixedTotal: 0,
        });
      }
      const row = rows.get(entityId) as RankingRow;

      if (p.gender === "MIXED") {
        row.mixedTotal += points;
      } else if (p.gender === "GIRLS") {
        if (p.game.isTimed) row.girlsTrack += points;
        else row.girlsField += points;
      } else {
        if (p.game.isTimed) row.boysTrack += points;
        else row.boysField += points;
      }
    }

    const standings = Array.from(rows.values())
      .map((row) => {
        const boysTotal = row.boysTrack + row.boysField;
        const girlsTotal = row.girlsTrack + row.girlsField;
        return {
          schoolId: row.entityId,
          schoolName: row.entityName,
          boysTrack: row.boysTrack,
          boysField: row.boysField,
          boysTotal,
          girlsTrack: row.girlsTrack,
          girlsField: row.girlsField,
          girlsTotal,
          mixedTotal: row.mixedTotal,
          grandTotal: boysTotal + girlsTotal + row.mixedTotal,
        };
      })
      .sort((a, b) => b.grandTotal - a.grandTotal)
      .map((row, index) => ({ ...row, position: index + 1 }));

    // Ball-games/indoor-games team fixtures don't produce Participant rows at
    // all (teams play each other directly via MatchPool), so they'd
    // otherwise never show up in the athletics-shaped table above.
    const allTeamStandings = await computeChampionshipTeamStandings(championshipId);
    const teamStandings = allTeamStandings.filter(
      (g) => !schoolLevelParam || schoolLevelParam === "OVERALL" || g.schoolLevel === schoolLevelParam,
    );

    return NextResponse.json({ standings, teamStandings });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
