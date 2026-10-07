import { prisma } from "./prisma";

/**
 * Learners' photos are only needed for identity checks at the championship
 * and for appeals and the rest of that season's levels, so they are deleted
 * about six months after the championship ends (Data Protection Act: keep
 * personal data no longer than its purpose needs). Names, schools, bibs,
 * results, dates of birth and birth certificate numbers stay. A learner who
 * competes again next season gets a fresh photo, which also matches how
 * they look then.
 */
export const PHOTO_RETENTION_DAYS = 183;

/** Deletes the photos of learners whose championship ended more than PHOTO_RETENTION_DAYS ago. Returns how many. */
export async function purgeExpiredLearnerPhotos(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await prisma.learner.updateMany({
    where: { photoUpdatedAt: { not: null }, championship: { endDate: { lt: cutoff } } },
    data: { photo: null, photoUpdatedAt: null },
  });
  return count;
}
