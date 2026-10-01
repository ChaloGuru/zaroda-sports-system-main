import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Throws unless `schoolId` is on the championship's own school list (see
 * ChampionshipSchool) - schools are only ever picked from that list.
 * Returns the school's name and county for follow-up checks/messages.
 */
export async function requireChampionshipSchool(
  championshipId: string,
  schoolId: string,
): Promise<{ name: string; county: string }> {
  const link = await prisma.championshipSchool.findUnique({
    where: { championshipId_schoolId: { championshipId, schoolId } },
    select: { school: { select: { name: true, county: true } } },
  });
  if (!link) throw new Error("That school isn't on this championship's school list - add it in the Schools tab first.");
  return link.school;
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
