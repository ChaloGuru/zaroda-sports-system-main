import { prisma } from "./prisma";
import { computeStandings, type BallSport, type MatchResult, type StandingRow } from "./scoring";

export interface TeamStandingRow extends StandingRow {
  teamName: string;
  /** Set at team registration (TeamsPanel) - rendered as a color accent on standings rows for at-a-glance identification. */
  teamColor: string | null;
}

export interface GameStandings {
  gameId: string;
  gameName: string;
  gender: string;
  schoolLevel: string;
  sport: BallSport;
  standings: TeamStandingRow[];
}

/**
 * Computes per-game team standings for every non-timed, sport-tagged game in
 * a championship (i.e. every ball-games/indoor-games fixture pool). Public
 * pages (game detail, championship overview, rankings, medal table) all read
 * from this so a saved fixture score is reflected everywhere consistently.
 */
export async function computeChampionshipTeamStandings(championshipId: string): Promise<GameStandings[]> {
  const games = await prisma.game.findMany({
    where: { championshipId, isTimed: false, sport: { not: null } },
    include: {
      matchPools: true,
      tournamentTeams: { select: { id: true, name: true, teamColor: true } },
    },
    orderBy: { name: "asc" },
  });

  return games
    .filter((game) => game.sport !== null)
    .map((game) => ({
      gameId: game.id,
      gameName: game.name,
      gender: game.gender,
      schoolLevel: game.schoolLevel,
      sport: game.sport as BallSport,
      standings: computeGameStandings(game.tournamentTeams, game.matchPools, game.sport as BallSport),
    }));
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
  matchPools: Array<{ teamAId: string; teamBId: string; teamAScore: number | null; teamBScore: number | null }>,
  sport: BallSport,
): TeamStandingRow[] {
  const results: MatchResult[] = matchPools
    .filter((mp) => mp.teamAScore !== null && mp.teamBScore !== null)
    .map((mp) => ({
      teamAId: mp.teamAId,
      teamBId: mp.teamBId,
      teamAScore: mp.teamAScore as number,
      teamBScore: mp.teamBScore as number,
    }));

  const teamIds = teams.map((t) => t.id);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const standings = computeStandings(teamIds, results, sport);

  return standings.map((row) => ({
    ...row,
    teamName: teamById.get(row.teamId)?.name ?? "Unknown team",
    teamColor: teamById.get(row.teamId)?.teamColor ?? null,
  }));
}
