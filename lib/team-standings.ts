import { prisma } from "./prisma";
import { computeStandings, type BallSport, type MatchResult, type StandingRow, type WalkoverResult } from "./scoring";

export interface TeamStandingRow extends StandingRow {
  teamName: string;
  /** Set at team registration (TeamsPanel) - rendered as a color accent on standings rows for at-a-glance identification. */
  teamColor: string | null;
}

export interface PoolStandings {
  poolId: string;
  poolName: string;
  standings: TeamStandingRow[];
}

export interface KnockoutFixtureRow {
  matchId: string;
  roundName: string;
  teamAId: string;
  teamAName: string;
  teamBId: string;
  teamBName: string;
  teamAScore: number | null;
  teamBScore: number | null;
  isWalkover: boolean;
  winnerId: string | null;
}

export interface GameStandings {
  gameId: string;
  gameName: string;
  gender: string;
  schoolLevel: string;
  sport: BallSport;
  standings: TeamStandingRow[];
  /** Same results broken down per pool - what Reports/standings display per pool per game. */
  pools: PoolStandings[];
  /** Knockout-stage fixtures (semis, final, etc.) - not pool-scoped, so a
   * standings/points table doesn't apply; these are shown as match results
   * instead, in the order they were created. */
  knockout: KnockoutFixtureRow[];
}

/**
 * "ALL" (default) sums pool-stage and knockout-stage results together, as a
 * league table normally does. "KNOCKOUT_ONLY" counts only knockout-stage
 * (non-pool) fixtures - useful for matching federations that score a ball
 * games championship purely off the bracket (semis/final) rather than full
 * round-robin standings.
 */
export type TeamStandingsScope = "ALL" | "KNOCKOUT_ONLY";

/**
 * Computes per-game team standings for every non-timed, sport-tagged game in
 * a championship (i.e. every ball-games/indoor-games fixture pool). Public
 * pages (game detail, championship overview, rankings, medal table) all read
 * from this so a saved fixture score is reflected everywhere consistently.
 */
export async function computeChampionshipTeamStandings(
  championshipId: string,
  scope: TeamStandingsScope = "ALL",
): Promise<GameStandings[]> {
  const games = await prisma.game.findMany({
    where: { championshipId, isTimed: false, sport: { not: null } },
    include: {
      matchPools: true,
      tournamentTeams: { select: { id: true, name: true, teamColor: true, poolId: true } },
      pools: { orderBy: { name: "asc" } },
    },
    orderBy: { name: "asc" },
  });

  return games
    .filter((game) => game.sport !== null)
    .map((game) => {
      const teamNameById = new Map(game.tournamentTeams.map((t) => [t.id, t.name]));
      const knockout: KnockoutFixtureRow[] = game.matchPools
        .filter((mp) => mp.poolId === null)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((mp) => ({
          matchId: mp.id,
          roundName: mp.roundName,
          teamAId: mp.teamAId,
          teamAName: teamNameById.get(mp.teamAId) ?? "Unknown team",
          teamBId: mp.teamBId,
          teamBName: teamNameById.get(mp.teamBId) ?? "Unknown team",
          teamAScore: mp.teamAScore,
          teamBScore: mp.teamBScore,
          isWalkover: mp.isWalkover,
          winnerId: mp.winnerId,
        }));

      const standingsMatchPools =
        scope === "KNOCKOUT_ONLY" ? game.matchPools.filter((mp) => mp.poolId === null) : game.matchPools;

      return {
        gameId: game.id,
        gameName: game.name,
        gender: game.gender,
        schoolLevel: game.schoolLevel,
        sport: game.sport as BallSport,
        standings: computeGameStandings(game.tournamentTeams, standingsMatchPools, game.sport as BallSport),
        pools: game.pools.map((pool) => ({
          poolId: pool.id,
          poolName: pool.name,
          standings: computeGameStandings(
            game.tournamentTeams.filter((t) => t.poolId === pool.id),
            game.matchPools.filter((mp) => mp.poolId === pool.id),
            game.sport as BallSport,
          ),
        })),
        knockout,
      };
    });
}

export async function computeSingleGameStandings(gameId: string): Promise<TeamStandingRow[] | null> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      matchPools: true,
      tournamentTeams: { select: { id: true, name: true, teamColor: true } },
    },
  });
  if (!game || game.isTimed || !game.sport) return null;

  return computeGameStandings(game.tournamentTeams, game.matchPools, game.sport);
}

function computeGameStandings(
  teams: Array<{ id: string; name: string; teamColor: string | null }>,
  matchPools: Array<{
    teamAId: string;
    teamBId: string;
    teamAScore: number | null;
    teamBScore: number | null;
    isWalkover: boolean;
    winnerId: string | null;
  }>,
  sport: BallSport,
): TeamStandingRow[] {
  const results: MatchResult[] = matchPools
    .filter((mp) => !mp.isWalkover && mp.teamAScore !== null && mp.teamBScore !== null)
    .map((mp) => ({
      teamAId: mp.teamAId,
      teamBId: mp.teamBId,
      teamAScore: mp.teamAScore as number,
      teamBScore: mp.teamBScore as number,
    }));
  const walkovers: WalkoverResult[] = matchPools
    .filter((mp) => mp.isWalkover && mp.winnerId !== null)
    .map((mp) => ({ teamAId: mp.teamAId, teamBId: mp.teamBId, winnerId: mp.winnerId as string }));

  const teamIds = teams.map((t) => t.id);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const standings = computeStandings(teamIds, results, sport, walkovers);

  return standings.map((row) => ({
    ...row,
    teamName: teamById.get(row.teamId)?.name ?? "Unknown team",
    teamColor: teamById.get(row.teamId)?.teamColor ?? null,
  }));
}
