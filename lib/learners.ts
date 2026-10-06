import type { Gender, Prisma, PrismaClient } from "@prisma/client";
import { assignNextBibNumber } from "./scoring";

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

export interface LearnerChanges {
  firstName?: string;
  lastName?: string;
  gender?: Gender;
  dateOfBirth?: Date | null;
  birthCertNumber?: string | null;
  bibNumber?: number;
}

/**
 * Applies identity changes to a learner and copies the shared fields onto
 * every one of their event entries, so all events show the same name and
 * bib. Checks the new bib and birth certificate number aren't someone else's first.
 */
export async function updateLearner(
  tx: Prisma.TransactionClient,
  learner: { id: string; championshipId: string; bibNumber: number; birthCertNumber: string | null },
  changes: LearnerChanges,
) {
  const data: Prisma.LearnerUpdateInput = {};
  if (changes.firstName !== undefined) data.firstName = changes.firstName.trim();
  if (changes.lastName !== undefined) data.lastName = changes.lastName.trim();
  if (changes.gender !== undefined) data.gender = changes.gender;
  if (changes.dateOfBirth !== undefined) data.dateOfBirth = changes.dateOfBirth;
  if (changes.birthCertNumber !== undefined) {
    const birthCertNumber = normalizeBirthCert(changes.birthCertNumber);
    if (birthCertNumber && birthCertNumber !== learner.birthCertNumber) {
      const other = await tx.learner.findUnique({
        where: { championshipId_birthCertNumber: { championshipId: learner.championshipId, birthCertNumber } },
        select: { firstName: true, lastName: true },
      });
      if (other) throw new Error(`Birth certificate entry no. ${birthCertNumber} is already registered to ${other.firstName} ${other.lastName}`);
    }
    data.birthCertNumber = birthCertNumber;
  }
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

/** Birth certificate entry numbers are stored uppercase without spaces, so typing differences don't hide a duplicate. */
export function normalizeBirthCert(value: string | null | undefined): string | null {
  const number = (value ?? "").replace(/\s+/g, "").toUpperCase();
  return number === "" ? null : number;
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
