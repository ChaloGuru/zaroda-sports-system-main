import type { Prisma, PrismaClient } from "@prisma/client";
import { LEARNER_ID_FIELDS, type LearnerIdKey } from "./learners";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Catching a learner who competes on someone else's details - typically an
 * older child entered with a younger sibling's birth certificate, under
 * their own photo. Nothing can prove a certificate belongs to the child
 * holding it, but the fraud leaves traces across championships and seasons:
 *
 * - ID_MISMATCH: the same birth certificate, KNEC or KEMIS number turns up
 *   with a different name, date of birth, gender or other ID number.
 * - DIFFERENT_FACE: the same ID number, but the photos are of different
 *   children (e.g. the real owner registered last season).
 * - SAME_FACE: one child's face under two different identities (e.g.
 *   registered under their own certificate last season, a sibling's now).
 *
 * Each becomes an alert for officials to look into - never an automatic
 * ban, since twins, typing mistakes and children growing up all happen.
 */
export type IdentityAlertKind = "ID_MISMATCH" | "DIFFERENT_FACE" | "SAME_FACE";
export type IdentityDifference = "name" | "dateOfBirth" | "gender" | LearnerIdKey;

/** face-api.js describes a face with 128 numbers. */
export const FACE_DESCRIPTOR_LENGTH = 128;
/** Further apart than this, two photos are probably different children (allowing for a year or two of growing up). */
export const DIFFERENT_FACE_DISTANCE = 0.62;
/** Closer than this, two photos are probably the same child. */
export const SAME_FACE_DISTANCE = 0.45;

/** Validates a descriptor from the browser and packs it for storage, or returns null if it isn't one. */
export function descriptorToBytes(values: unknown): Buffer | null {
  if (!Array.isArray(values) || values.length !== FACE_DESCRIPTOR_LENGTH) return null;
  if (!values.every((v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 10)) return null;
  return Buffer.from(new Float32Array(values as number[]).buffer);
}

export function bytesToDescriptor(bytes: Uint8Array | null | undefined): Float32Array | null {
  if (!bytes || bytes.byteLength !== FACE_DESCRIPTOR_LENGTH * 4) return null;
  // Copy into an aligned buffer - Prisma's Buffers can start at any offset.
  return new Float32Array(Uint8Array.from(bytes).buffer);
}

/** Euclidean distance between two face descriptors - lower is more alike. */
export function faceDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += ((a[i] ?? 0) - (b[i] ?? 0)) ** 2;
  return Math.sqrt(sum);
}

function nameTokens(first: string, last: string): string[] {
  return Array.from(new Set(`${first} ${last}`.toLowerCase().split(/[^a-z']+/).filter((t) => t.length >= 2)));
}

/**
 * Whether two names are the same person's: at least two names in common
 * (in any order), or the one name a single-name record has. Sharing just a
 * surname isn't enough - siblings share one.
 */
export function namesAgree(a: { firstName: string; lastName: string }, b: { firstName: string; lastName: string }): boolean {
  const ta = nameTokens(a.firstName, a.lastName);
  const tb = new Set(nameTokens(b.firstName, b.lastName));
  const common = ta.filter((t) => tb.has(t)).length;
  return common >= Math.min(2, ta.length, tb.size);
}

export interface IdentityRecord {
  id: string;
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: Date | null;
  birthCertNumber: string | null;
  knecAssessmentNumber: string | null;
  kemisUpi: string | null;
  faceDescriptor: Uint8Array | null;
}

function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

/** The ID numbers two records share, and the details on which they disagree (only where both give one). */
export function compareIdentities(a: IdentityRecord, b: IdentityRecord): { shared: LearnerIdKey[]; differences: IdentityDifference[] } {
  const shared: LearnerIdKey[] = [];
  const differences: IdentityDifference[] = [];
  for (const { key } of LEARNER_ID_FIELDS) {
    if (!a[key] || !b[key]) continue;
    if (a[key] === b[key]) shared.push(key);
    else differences.push(key);
  }
  if (!namesAgree(a, b)) differences.push("name");
  if (a.dateOfBirth && b.dateOfBirth && !sameDay(a.dateOfBirth, b.dateOfBirth)) differences.push("dateOfBirth");
  if (a.gender !== b.gender && a.gender !== "MIXED" && b.gender !== "MIXED") differences.push("gender");
  return { shared, differences };
}

export interface FoundAlert {
  kind: IdentityAlertKind;
  details: { shared?: LearnerIdKey[]; differences?: IdentityDifference[]; distance?: number };
}

/** What doesn't add up between two learner records - nothing for the same child's records. */
export function findIdentityAlerts(a: IdentityRecord, b: IdentityRecord): FoundAlert[] {
  const { shared, differences } = compareIdentities(a, b);
  const faceA = bytesToDescriptor(a.faceDescriptor);
  const faceB = bytesToDescriptor(b.faceDescriptor);
  const distance = faceA && faceB ? Math.round(faceDistance(faceA, faceB) * 1000) / 1000 : null;
  const alerts: FoundAlert[] = [];
  if (shared.length > 0) {
    if (differences.length > 0) alerts.push({ kind: "ID_MISMATCH", details: { shared, differences } });
    if (distance !== null && distance > DIFFERENT_FACE_DISTANCE) alerts.push({ kind: "DIFFERENT_FACE", details: { shared, distance } });
  } else if (distance !== null && distance < SAME_FACE_DISTANCE && differences.length > 0) {
    alerts.push({ kind: "SAME_FACE", details: { differences, distance } });
  }
  return alerts;
}

const IDENTITY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  gender: true,
  dateOfBirth: true,
  birthCertNumber: true,
  knecAssessmentNumber: true,
  kemisUpi: true,
  faceDescriptor: true,
} as const;

/**
 * Re-checks one learner against every other record: any championship's
 * learners sharing one of their ID numbers, and - for the face - the
 * learners of this championship and of the organiser's other championships.
 * Alerts that no longer apply are removed; an alert whose details haven't
 * changed keeps its review.
 */
export async function refreshIdentityAlerts(db: Db, learnerId: string): Promise<void> {
  const learner = await db.learner.findUnique({
    where: { id: learnerId },
    select: { ...IDENTITY_SELECT, championshipId: true, championship: { select: { tenantId: true } } },
  });
  if (!learner) return;

  const idMatches = LEARNER_ID_FIELDS.filter(({ key }) => learner[key]).map(({ key }) => ({ [key]: learner[key] }));
  const [byId, byFace] = await Promise.all([
    idMatches.length
      ? db.learner.findMany({ where: { id: { not: learner.id }, OR: idMatches }, select: IDENTITY_SELECT, take: 200 })
      : Promise.resolve([]),
    learner.faceDescriptor
      ? db.learner.findMany({
          where: {
            id: { not: learner.id },
            faceDescriptor: { not: null },
            OR: [{ championshipId: learner.championshipId }, { championship: { tenantId: learner.championship.tenantId } }],
          },
          select: IDENTITY_SELECT,
        })
      : Promise.resolve([]),
  ]);
  const others = new Map([...byId, ...byFace].map((o) => [o.id, o]));

  const found = new Map<string, { learnerAId: string; learnerBId: string; kind: IdentityAlertKind; details: FoundAlert["details"] }>();
  for (const other of others.values()) {
    const [learnerAId, learnerBId] = learner.id < other.id ? [learner.id, other.id] : [other.id, learner.id];
    for (const alert of findIdentityAlerts(learner, other)) {
      found.set(`${learnerAId}|${learnerBId}|${alert.kind}`, { learnerAId, learnerBId, ...alert });
    }
  }

  const existing = await db.learnerIdentityAlert.findMany({
    where: { OR: [{ learnerAId: learner.id }, { learnerBId: learner.id }] },
    select: { id: true, learnerAId: true, learnerBId: true, kind: true, details: true },
  });
  for (const alert of existing) {
    const key = `${alert.learnerAId}|${alert.learnerBId}|${alert.kind}`;
    const now = found.get(key);
    if (!now) {
      await db.learnerIdentityAlert.delete({ where: { id: alert.id } });
    } else {
      found.delete(key);
      if (JSON.stringify(alert.details) !== JSON.stringify(now.details)) {
        // Something changed - it needs looking at again.
        await db.learnerIdentityAlert.update({
          where: { id: alert.id },
          data: { details: now.details, reviewedAt: null, reviewedBy: null, reviewNote: null },
        });
      }
    }
  }
  for (const alert of found.values()) {
    await db.learnerIdentityAlert.create({ data: alert });
  }
}

/** refreshIdentityAlerts after a learner is saved - a failed check is logged, never undoes the save. */
export async function refreshIdentityAlertsSafely(db: Db, learnerIds: string | string[]): Promise<void> {
  for (const id of Array.isArray(learnerIds) ? learnerIds : [learnerIds]) {
    try {
      await refreshIdentityAlerts(db, id);
    } catch (error) {
      console.error(`Identity check for learner ${id} failed`, error);
    }
  }
}

export const IDENTITY_DIFFERENCE_LABELS: Record<IdentityDifference, string> = {
  name: "name",
  dateOfBirth: "date of birth",
  gender: "gender",
  birthCertNumber: "birth certificate no.",
  knecAssessmentNumber: "KNEC assessment no.",
  kemisUpi: "KEMIS UPI",
};

/** An identity alert as one championship's officials see it, from their learner's side. */
export interface IdentityAlertView {
  id: string;
  kind: IdentityAlertKind;
  details: FoundAlert["details"];
  reviewedAt: Date | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  /** This championship's learner the alert is about. */
  learnerId: string;
  /** The other record. Another organiser's learner shows only when and what differs. */
  other: {
    learnerId: string | null;
    sameChampionship: boolean;
    sameOrganiser: boolean;
    championshipName: string | null;
    year: number;
    name: string | null;
    dateOfBirth: Date | null;
    schoolName: string | null;
    birthCertNumber: string | null;
    knecAssessmentNumber: string | null;
    kemisUpi: string | null;
    photoUpdatedAt: Date | null;
    idDocumentUpdatedAt: Date | null;
  };
}

const ALERT_SIDE = {
  id: true,
  championshipId: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  birthCertNumber: true,
  knecAssessmentNumber: true,
  kemisUpi: true,
  photoUpdatedAt: true,
  idDocumentUpdatedAt: true,
  school: { select: { name: true } },
  championship: { select: { name: true, startDate: true, tenantId: true } },
} as const;

/** The identity alerts touching a championship's learners, keyed by learner id. */
export async function identityAlertViews(db: Db, championship: { id: string; tenantId: string }): Promise<Map<string, IdentityAlertView[]>> {
  const alerts = await db.learnerIdentityAlert.findMany({
    where: { OR: [{ learnerA: { championshipId: championship.id } }, { learnerB: { championshipId: championship.id } }] },
    include: { learnerA: { select: ALERT_SIDE }, learnerB: { select: ALERT_SIDE } },
    orderBy: { createdAt: "desc" },
  });
  const views = new Map<string, IdentityAlertView[]>();
  for (const alert of alerts) {
    for (const [mine, other] of [
      [alert.learnerA, alert.learnerB],
      [alert.learnerB, alert.learnerA],
    ] as const) {
      if (mine.championshipId !== championship.id) continue;
      const sameOrganiser = other.championship.tenantId === championship.tenantId;
      const view: IdentityAlertView = {
        id: alert.id,
        kind: alert.kind as IdentityAlertKind,
        details: alert.details as FoundAlert["details"],
        reviewedAt: alert.reviewedAt,
        reviewedBy: alert.reviewedBy,
        reviewNote: alert.reviewNote,
        learnerId: mine.id,
        other: {
          learnerId: sameOrganiser ? other.id : null,
          sameChampionship: other.championshipId === championship.id,
          sameOrganiser,
          championshipName: sameOrganiser ? other.championship.name : null,
          year: other.championship.startDate.getUTCFullYear(),
          name: sameOrganiser ? `${other.firstName} ${other.lastName}` : null,
          dateOfBirth: sameOrganiser ? other.dateOfBirth : null,
          schoolName: sameOrganiser ? (other.school?.name ?? null) : null,
          birthCertNumber: sameOrganiser ? other.birthCertNumber : null,
          knecAssessmentNumber: sameOrganiser ? other.knecAssessmentNumber : null,
          kemisUpi: sameOrganiser ? other.kemisUpi : null,
          photoUpdatedAt: sameOrganiser ? other.photoUpdatedAt : null,
          idDocumentUpdatedAt: sameOrganiser ? other.idDocumentUpdatedAt : null,
        },
      };
      views.set(mine.id, [...(views.get(mine.id) ?? []), view]);
    }
  }
  return views;
}
