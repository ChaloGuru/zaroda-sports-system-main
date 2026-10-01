import type { Prisma, SchoolLevel } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Throws unless `schoolId` is on the championship's own school list (see
 * ChampionshipSchool) - schools are only ever picked from that list.
 * Returns the school's name and county for follow-up checks/messages.
 */
export async function requireChampionshipSchool(
  championshipId: string,
  schoolId: string,
): Promise<{ name: string; county: string; schoolLevel: SchoolLevel | null }> {
  const link = await prisma.championshipSchool.findUnique({
    where: { championshipId_schoolId: { championshipId, schoolId } },
    select: { school: { select: { name: true, county: true, schoolLevel: true } } },
  });
  if (!link) throw new Error("That school isn't on this championship's school list - add it in the Schools tab first.");
  return link.school;
}

/**
 * Finds the championship school a team named `teamName` represents, so the
 * team can be linked to it (TournamentTeam.schoolId). In a Primary/JS
 * championship a school has a Primary and a JS entry - the one matching the
 * team's game level is used. Returns null for names that aren't on the
 * school list (e.g. open-tournament organizations).
 */
export async function resolveTeamSchoolId(
  championshipId: string,
  teamName: string,
  gameSchoolLevel: SchoolLevel | null | undefined,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<string | null> {
  const candidates = await client.championshipSchool.findMany({
    where: { championshipId, school: { name: { equals: teamName.trim(), mode: "insensitive" } } },
    select: { school: { select: { id: true, schoolLevel: true } } },
  });
  const match = candidates.find((c) => !c.school.schoolLevel || c.school.schoolLevel === gameSchoolLevel);
  return match?.school.id ?? null;
}

/** Puts a school on a championship's list if it isn't there already (e.g. when promoting its athletes). */
export async function ensureChampionshipSchool(
  championshipId: string,
  schoolId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  await client.championshipSchool.upsert({
    where: { championshipId_schoolId: { championshipId, schoolId } },
    create: { championshipId, schoolId },
    update: {},
  });
}
