import { prisma } from "./prisma";
import { pointsForPosition } from "./scoring";
import { computeChampionshipTeamStandings } from "./team-standings";
import { buildCanonicalNameMap } from "./org-name";

export interface OrganizationRankingRow {
  name: string;
  points: number;
  position: number;
}

export interface OrganizationRankingsFilters {
  /** Omit (or "OVERALL") to include BOYS + GIRLS + MIXED. */
  gender?: "BOYS" | "GIRLS" | "OVERALL";
  /** Game.schoolLevel value (PRIMARY | JS | SENIOR_SCHOOL | TERTIARY). Omit (or "OVERALL") for all. */
  schoolLevel?: string;
}

/**
 * One combined leaderboard per participating organization/school/team,
 * summing points earned across every event they took part in - athletics
 * placings (via pointsForPosition) and ball-games/indoor-games W/D/L points
 * (via computeChampionshipTeamStandings) alike.
 *
 * Organizations are grouped by name rather than by School/TournamentTeam id:
 * a school registers once (one School row) for athletics, but registers a
 * *separate* TournamentTeam row per ball game it enters (see the bulk
 * "Add organizations" flow in TeamsPanel) - name is the only identifier
 * that's consistent for the same real-world organization across both.
 */
export async function computeOrganizationRankings(
  championshipId: string,
  filters: OrganizationRankingsFilters = {},
): Promise<OrganizationRankingRow[]> {
  const genderFilter = !filters.gender || filters.gender === "OVERALL" ? null : filters.gender;
  const schoolLevelFilter = !filters.schoolLevel || filters.schoolLevel === "OVERALL" ? null : filters.schoolLevel;

  // allNames spans the WHOLE championship, unfiltered - a bare root name like
  // "URIRI" might only ever compete at PRIMARY level while "URIRI - LUORO JS"
  // competes at JS level, so folding the latter into the former must be able
  // to see both names even when the caller has filtered to just one level.
  const allNames: string[] = [];
  const contributions: Array<{ name: string; amount: number }> = [];

  const participants = await prisma.participant.findMany({
    where: { championshipId, position: { not: null } },
    include: {
      game: { select: { schoolLevel: true } },
      school: { select: { name: true } },
      tournamentTeam: { select: { name: true } },
    },
  });
  for (const p of participants) {
    if (p.position === null) continue;
    const name = p.school?.name ?? p.tournamentTeam?.name;
    if (!name) continue;
    allNames.push(name);
    if (genderFilter && p.gender !== genderFilter) continue;
    if (schoolLevelFilter && p.game.schoolLevel !== schoolLevelFilter) continue;
    contributions.push({ name, amount: pointsForPosition(p.position) });
  }

  const gameStandings = await computeChampionshipTeamStandings(championshipId);
  for (const game of gameStandings) {
    for (const row of game.standings) {
      allNames.push(row.teamName);
    }
    if (genderFilter && game.gender !== genderFilter) continue;
    if (schoolLevelFilter && game.schoolLevel !== schoolLevelFilter) continue;
    for (const row of game.standings) {
      contributions.push({ name: row.teamName, amount: row.points });
    }
  }

  const canonicalNames = buildCanonicalNameMap(allNames);
  const points = new Map<string, number>();
  for (const { name: rawName, amount } of contributions) {
    const name = canonicalNames.get(rawName.trim()) ?? rawName.trim();
    if (!name || amount === 0) continue;
    points.set(name, (points.get(name) ?? 0) + amount);
  }

  return Array.from(points.entries())
    .map(([name, total]) => ({ name, points: total }))
    .sort((a, b) => b.points - a.points)
    .map((row, index) => ({ ...row, position: index + 1 }));
}
