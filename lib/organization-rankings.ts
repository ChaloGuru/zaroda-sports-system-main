import { prisma } from "./prisma";
import { pointsForPosition } from "./scoring";
import { computeChampionshipTeamStandings } from "./team-standings";

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

  const points = new Map<string, number>();
  const addPoints = (rawName: string, amount: number) => {
    const name = rawName.trim();
    if (!name || amount === 0) return;
    points.set(name, (points.get(name) ?? 0) + amount);
  };

  const participants = await prisma.participant.findMany({
    where: {
      championshipId,
      position: { not: null },
      ...(genderFilter ? { gender: genderFilter } : {}),
    },
    include: {
      game: { select: { schoolLevel: true } },
      school: { select: { name: true } },
      tournamentTeam: { select: { name: true } },
    },
  });
  for (const p of participants) {
    if (p.position === null) continue;
    if (schoolLevelFilter && p.game.schoolLevel !== schoolLevelFilter) continue;
    const name = p.school?.name ?? p.tournamentTeam?.name;
    if (!name) continue;
    addPoints(name, pointsForPosition(p.position));
  }

  const gameStandings = await computeChampionshipTeamStandings(championshipId);
  for (const game of gameStandings) {
    if (genderFilter && game.gender !== genderFilter) continue;
    if (schoolLevelFilter && game.schoolLevel !== schoolLevelFilter) continue;
    for (const row of game.standings) {
      addPoints(row.teamName, row.points);
    }
  }

  return Array.from(points.entries())
    .map(([name, total]) => ({ name, points: total }))
    .sort((a, b) => b.points - a.points)
    .map((row, index) => ({ ...row, position: index + 1 }));
}
