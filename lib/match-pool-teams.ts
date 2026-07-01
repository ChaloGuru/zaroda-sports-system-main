import { prisma } from "./prisma";

/**
 * MatchPool.teamAId/teamBId reference either a TournamentTeam or a School -
 * there's no single FK table for it (see schema.prisma), so display names
 * must be resolved against both tables.
 */
export async function resolveTeamNames(ids: string[]): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(ids));
  const [teams, schools] = await Promise.all([
    prisma.tournamentTeam.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, name: true } }),
    prisma.school.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, name: true } }),
  ]);
  const names = new Map<string, string>();
  for (const t of teams) names.set(t.id, t.name);
  for (const s of schools) names.set(s.id, s.name);
  return names;
}
