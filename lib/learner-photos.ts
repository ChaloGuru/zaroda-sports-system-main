import { prisma } from "./prisma";

/**
 * Learners' photos and ID documents are only needed for identity checks at
 * the championship and for appeals and the rest of that season's levels,
 * so they are deleted about six months after the championship ends (Data
 * Protection Act: keep personal data no longer than its purpose needs).
 * Names, schools, bibs, results, dates of birth and ID numbers stay. A
 * learner who competes again next season gets a fresh photo, which also
 * matches how they look then.
 */
export const PHOTO_RETENTION_DAYS = 183;

/**
 * The face descriptor (128 numbers, not a picture - lib/identity-checks.ts)
 * is kept for three years, so next season's photo can be matched against
 * last season's: that's how a child entered under a sibling's certificate
 * is caught.
 */
export const FACE_RETENTION_DAYS = 3 * 365;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Deletes photos and documents, and later face descriptors, past their retention. Returns how many learners each touched. */
export async function purgeExpiredLearnerPhotos(now = new Date()): Promise<{ photos: number; documents: number; faces: number }> {
  const photoCutoff = new Date(now.getTime() - PHOTO_RETENTION_DAYS * DAY_MS);
  const faceCutoff = new Date(now.getTime() - FACE_RETENTION_DAYS * DAY_MS);
  const [photos, documents, faces] = await Promise.all([
    prisma.learner.updateMany({
      where: { photoUpdatedAt: { not: null }, championship: { endDate: { lt: photoCutoff } } },
      data: { photo: null, photoUpdatedAt: null },
    }),
    prisma.learner.updateMany({
      where: { idDocumentUpdatedAt: { not: null }, championship: { endDate: { lt: photoCutoff } } },
      data: { idDocument: null, idDocumentKind: null, idDocumentUpdatedAt: null },
    }),
    prisma.learner.updateMany({
      where: { faceDescriptor: { not: null }, championship: { endDate: { lt: faceCutoff } } },
      data: { faceDescriptor: null },
    }),
  ]);
  return { photos: photos.count, documents: documents.count, faces: faces.count };
}
