import type { Gender, Prisma, PrismaClient } from "@prisma/client";
import { assignNextBibNumber } from "./scoring";
import { prisma } from "./prisma";
import { gameSchoolLevelLabel } from "./school-levels";
import { AuthorizationError, getAuthContext, managedTeamSchoolIds, requireChampionshipAccess, type AuthContext } from "./authorize";

type Db = PrismaClient | Prisma.TransactionClient;

/** A learner without the photo bytes - for reads and API responses. */
export const LEARNER_FIELDS = {
  id: true,
  championshipId: true,
  schoolId: true,
  firstName: true,
  lastName: true,
  gender: true,
  dateOfBirth: true,
  birthCertNumber: true,
  knecAssessmentNumber: true,
  kemisUpi: true,
  bibNumber: true,
  photoUpdatedAt: true,
} satisfies Prisma.LearnerSelect;

/**
 * A bib belongs to one learner championship-wide, but that learner's entries
 * all carry it. Returns why `bibNumber` can't go to `learnerId` (null for a
 * new learner), or null when it's free.
 */
export async function bibConflict(db: Db, championshipId: string, bibNumber: number, learnerId: string | null): Promise<string | null> {
  const learner = await db.learner.findFirst({
    where: { championshipId, bibNumber, ...(learnerId ? { NOT: { id: learnerId } } : {}) },
    select: { firstName: true, lastName: true },
  });
  if (learner) return `Bib ${bibNumber} already belongs to ${learner.firstName} ${learner.lastName}`;
  // Entries without a learner (open-tournament and ball-game rosters).
  const entry = await db.participant.findFirst({
    where: { championshipId, bibNumber, learnerId: null },
    select: { firstName: true, lastName: true },
  });
  if (entry) return `Bib ${bibNumber} is already in use by ${entry.firstName} ${entry.lastName}`;
  return null;
}

/** The highest bib used in a championship, by a learner or any entry - for numbering past it. */
export async function highestBib(db: Db, championshipId: string): Promise<number> {
  const [entry, learner] = await Promise.all([
    db.participant.findFirst({ where: { championshipId }, orderBy: { bibNumber: "desc" }, select: { bibNumber: true } }),
    db.learner.findFirst({ where: { championshipId }, orderBy: { bibNumber: "desc" }, select: { bibNumber: true } }),
  ]);
  return Math.max(entry?.bibNumber ?? 0, learner?.bibNumber ?? 0);
}

/** The next free bib in a school's range, counting its learners and any older entries. */
export async function nextSchoolBib(db: Db, championshipId: string, schoolId: string, schoolName: string): Promise<number> {
  const range = await db.schoolBibRange.findUnique({ where: { championshipId_schoolId: { championshipId, schoolId } } });
  if (!range) {
    throw new Error(`${schoolName} has no bib range yet - allocate one in the Bib Ranges tab, or enter a bib number.`);
  }
  const [learners, entries] = await Promise.all([
    db.learner.findMany({ where: { championshipId, schoolId }, select: { bibNumber: true } }),
    db.participant.findMany({ where: { championshipId, schoolId }, select: { bibNumber: true } }),
  ]);
  const used = [...learners, ...entries].map((r) => r.bibNumber).filter((b) => b >= range.rangeStart && b <= range.rangeEnd);
  return assignNextBibNumber(schoolId, range, used);
}

/** A learner's official ID numbers - each optional, and each belongs to one learner per championship. */
export const LEARNER_ID_FIELDS = [
  { key: "birthCertNumber", label: "Birth certificate entry no." },
  { key: "knecAssessmentNumber", label: "KNEC assessment no." },
  { key: "kemisUpi", label: "KEMIS UPI" },
] as const;
export type LearnerIdKey = (typeof LEARNER_ID_FIELDS)[number]["key"];
export type LearnerIds = Partial<Record<LearnerIdKey, string | null>>;

/** ID numbers are stored uppercase without spaces, so typing differences don't hide a duplicate. */
export function normalizeIdNumber(value: string | null | undefined): string | null {
  const number = (value ?? "").replace(/\s+/g, "").toUpperCase();
  return number === "" ? null : number;
}

/** The given ID numbers, normalised, for saving on a learner. */
export function normalizeIds(ids: LearnerIds): Record<LearnerIdKey, string | null> {
  return Object.fromEntries(LEARNER_ID_FIELDS.map(({ key }) => [key, normalizeIdNumber(ids[key])])) as Record<LearnerIdKey, string | null>;
}

/** Why one of these ID numbers can't go to this learner - another learner in the championship has it - or null. */
export async function idNumberConflict(db: Db, championshipId: string, ids: LearnerIds, learnerId: string | null): Promise<string | null> {
  for (const { key, label } of LEARNER_ID_FIELDS) {
    const value = normalizeIdNumber(ids[key]);
    if (!value) continue;
    const other = await db.learner.findFirst({
      where: { championshipId, [key]: value, ...(learnerId ? { NOT: { id: learnerId } } : {}) },
      select: { firstName: true, lastName: true },
    });
    if (other) return `${label} ${value} is already registered to ${other.firstName} ${other.lastName}`;
  }
  return null;
}

export interface LearnerChanges extends LearnerIds {
  firstName?: string;
  lastName?: string;
  gender?: Gender;
  dateOfBirth?: Date | null;
  bibNumber?: number;
}

/**
 * Applies identity changes to a learner and copies the shared fields onto
 * every one of their event entries, so all events show the same name and
 * bib. Checks the new bib and ID numbers aren't someone else's first.
 */
export async function updateLearner(
  tx: Prisma.TransactionClient,
  learner: { id: string; championshipId: string; bibNumber: number },
  changes: LearnerChanges,
) {
  const data: Prisma.LearnerUpdateInput = {};
  if (changes.firstName !== undefined) data.firstName = changes.firstName.trim();
  if (changes.lastName !== undefined) data.lastName = changes.lastName.trim();
  if (changes.gender !== undefined) data.gender = changes.gender;
  if (changes.dateOfBirth !== undefined) data.dateOfBirth = changes.dateOfBirth;
  const idChanges: LearnerIds = {};
  for (const { key } of LEARNER_ID_FIELDS) {
    if (changes[key] !== undefined) idChanges[key] = normalizeIdNumber(changes[key]);
  }
  const conflict = await idNumberConflict(tx, learner.championshipId, idChanges, learner.id);
  if (conflict) throw new Error(conflict);
  Object.assign(data, idChanges);
  if (changes.bibNumber !== undefined && changes.bibNumber !== learner.bibNumber) {
    const conflict = await bibConflict(tx, learner.championshipId, changes.bibNumber, learner.id);
    if (conflict) throw new Error(conflict);
    data.bibNumber = changes.bibNumber;
  }

  const updated = await tx.learner.update({ where: { id: learner.id }, data, select: LEARNER_FIELDS });
  await tx.participant.updateMany({
    where: { learnerId: learner.id },
    data: {
      firstName: updated.firstName,
      lastName: updated.lastName,
      gender: updated.gender,
      dateOfBirth: updated.dateOfBirth,
      bibNumber: updated.bibNumber,
    },
  });
  return updated;
}

/**
 * Who can change a learner's details and photo: the championship's
 * tournament admins and scorekeepers, and the manager of a team from the
 * learner's school (they register their own players).
 */
export async function requireLearnerEditor(learner: { championshipId: string; schoolId: string | null }): Promise<AuthContext> {
  try {
    return await requireChampionshipAccess(learner.championshipId, ["TOURNAMENT_ADMIN", "SCOREKEEPER"]);
  } catch (error) {
    const ctx = await getAuthContext();
    if (ctx && learner.schoolId && (await managedTeamSchoolIds(ctx, learner.championshipId)).includes(learner.schoolId)) return ctx;
    throw error;
  }
}

const KENYA_DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" };

/**
 * After a championship's registration deadline only its tournament admins
 * can add or change learners - so who is competing can't be quietly
 * swapped late. Every change is still audited.
 */
export async function assertRegistrationOpen(championshipId: string): Promise<void> {
  const championship = await prisma.championship.findUnique({ where: { id: championshipId }, select: { registrationClosesAt: true } });
  const closesAt = championship?.registrationClosesAt;
  if (!closesAt || closesAt > new Date()) return;
  try {
    await requireChampionshipAccess(championshipId, ["TOURNAMENT_ADMIN"]);
  } catch {
    throw new AuthorizationError(
      `Registration closed on ${closesAt.toLocaleDateString("en-GB", KENYA_DATE)} - only a tournament admin can add or change learners now`,
    );
  }
}

/** The date ages are worked out on: the championship's age date, or its start date. */
export function ageDateOf(championship: { ageCutoffDate: Date | null; startDate: Date }): Date {
  return championship.ageCutoffDate ?? championship.startDate;
}

/**
 * Why a learner is too old for a school level's events, or null when
 * they're within its limit (or it has none). Learners without a date of
 * birth pass here and are flagged on the Learners tab instead.
 */
export function overAgeReason(
  learner: { firstName: string; lastName: string; dateOfBirth: Date | null },
  limit: { schoolLevel: string; maxAge: number | null },
  ageDate: Date,
): string | null {
  if (limit.maxAge == null || !learner.dateOfBirth) return null;
  const age = ageOn(learner.dateOfBirth, ageDate);
  if (age <= limit.maxAge) return null;
  return `${learner.firstName} ${learner.lastName} is ${age} on ${ageDate.toLocaleDateString("en-GB", KENYA_DATE)} - ${gameSchoolLevelLabel(limit.schoolLevel)} events are for learners aged ${limit.maxAge} and under`;
}

/** A championship's age date and its limits by school level. */
export async function loadAgeRules(db: Db, championshipId: string) {
  const championship = await db.championship.findUnique({
    where: { id: championshipId },
    select: { ageCutoffDate: true, startDate: true, ageLimits: { select: { schoolLevel: true, maxAge: true } } },
  });
  if (!championship) return null;
  const limits = new Map(championship.ageLimits.map((l) => [l.schoolLevel as string, l.maxAge]));
  return {
    ageDate: ageDateOf(championship),
    maxAgeFor: (schoolLevel: string) => limits.get(schoolLevel) ?? null,
  };
}

/** Refuses a learner older than the age limit for the school level of the events they're entering. */
export async function assertWithinAgeLimit(
  championshipId: string,
  learner: { firstName: string; lastName: string; dateOfBirth: Date | null },
  schoolLevels: string[],
): Promise<void> {
  if (!learner.dateOfBirth || schoolLevels.length === 0) return;
  const rules = await loadAgeRules(prisma, championshipId);
  if (!rules) return;
  for (const schoolLevel of new Set(schoolLevels)) {
    const reason = overAgeReason(learner, { schoolLevel, maxAge: rules.maxAgeFor(schoolLevel) }, rules.ageDate);
    if (reason) throw new Error(reason);
  }
}

/** Whole years old on `on` - for showing an age beside the date of birth. */
export function ageOn(dateOfBirth: Date, on: Date): number {
  const age = on.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < dateOfBirth.getUTCMonth() ||
    (on.getUTCMonth() === dateOfBirth.getUTCMonth() && on.getUTCDate() < dateOfBirth.getUTCDate());
  return beforeBirthday ? age - 1 : age;
}

export const MAX_PHOTO_BYTES = 300 * 1024;

/** JPEG, PNG or WebP by their file signatures - the declared type isn't trusted. */
export function photoContentType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Joins a learner registered twice into one: `keep` takes over every event
 * `duplicate` is entered in (under `keep`'s bib) and any details only the
 * duplicate has, then the duplicate is deleted. Refused across schools or
 * when both are entered in the same event - remove one entry first.
 */
export async function mergeLearners(tx: Prisma.TransactionClient, keepId: string, duplicateId: string) {
  if (keepId === duplicateId) throw new Error("Pick two different learners to merge");
  const select = { ...LEARNER_FIELDS, photo: true } as const;
  const [keep, duplicate] = await Promise.all([
    tx.learner.findUnique({ where: { id: keepId }, select }),
    tx.learner.findUnique({ where: { id: duplicateId }, select }),
  ]);
  if (!keep || !duplicate || keep.championshipId !== duplicate.championshipId) throw new Error("Learner not found in this championship");
  if (keep.schoolId !== duplicate.schoolId) throw new Error("Only learners from the same school can be merged");

  const [keepEntries, duplicateEntries] = await Promise.all([
    tx.participant.findMany({ where: { learnerId: keep.id }, select: { gameId: true } }),
    tx.participant.findMany({ where: { learnerId: duplicate.id }, select: { id: true, gameId: true, game: { select: { name: true } } } }),
  ]);
  const keepGames = new Set(keepEntries.map((e) => e.gameId));
  const clash = duplicateEntries.find((e) => keepGames.has(e.gameId));
  if (clash) throw new Error(`Both are entered in ${clash.game.name} - remove one of those entries first`);

  // The duplicate's record goes first, freeing its birth certificate number.
  await tx.participant.updateMany({ where: { learnerId: duplicate.id }, data: { learnerId: keep.id } });
  await tx.learner.delete({ where: { id: duplicate.id } });
  await tx.learner.update({
    where: { id: keep.id },
    data: {
      dateOfBirth: keep.dateOfBirth ?? duplicate.dateOfBirth,
      birthCertNumber: keep.birthCertNumber ?? duplicate.birthCertNumber,
      knecAssessmentNumber: keep.knecAssessmentNumber ?? duplicate.knecAssessmentNumber,
      kemisUpi: keep.kemisUpi ?? duplicate.kemisUpi,
      ...(!keep.photo && duplicate.photo ? { photo: duplicate.photo, photoUpdatedAt: duplicate.photoUpdatedAt } : {}),
    },
  });
  // Every entry - including the ones just moved - shows the kept learner.
  const learner = await updateLearner(tx, keep, {});
  return { learner, movedEntries: duplicateEntries.length };
}

type PromotableLearner = Prisma.LearnerGetPayload<Record<string, never>>;

/**
 * A promoted learner's record at the next level, if there is one already -
 * the one promoted from them, or one their school registered there with the
 * same ID number (birth certificate, KNEC or KEMIS). They keep that record (and its bib)
 * however many events or teams they're promoted in.
 */
export function findPromotedLearner(db: Db, origin: PromotableLearner, targetChampionshipId: string) {
  return db.learner.findFirst({
    where: {
      championshipId: targetChampionshipId,
      OR: [
        { promotedFromLearnerId: origin.id },
        ...LEARNER_ID_FIELDS.filter(({ key }) => origin[key]).map(({ key }) => ({ [key]: origin[key] })),
      ],
    },
  });
}

/** Registers a promoted learner at the next level, with their photo, date of birth and birth certificate number. */
export function createPromotedLearner(tx: Prisma.TransactionClient, origin: PromotableLearner, targetChampionshipId: string, bibNumber: number) {
  return tx.learner.create({
    data: {
      championshipId: targetChampionshipId,
      schoolId: origin.schoolId,
      firstName: origin.firstName,
      lastName: origin.lastName,
      gender: origin.gender,
      dateOfBirth: origin.dateOfBirth,
      birthCertNumber: origin.birthCertNumber,
      knecAssessmentNumber: origin.knecAssessmentNumber,
      kemisUpi: origin.kemisUpi,
      bibNumber,
      photo: origin.photo,
      photoUpdatedAt: origin.photoUpdatedAt,
      promotedFromLearnerId: origin.id,
    },
  });
}
