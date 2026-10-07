import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FACE_RETENTION_DAYS, PHOTO_RETENTION_DAYS, purgeExpiredLearnerPhotos } from "@/lib/learner-photos";

export const dynamic = "force-dynamic";

/**
 * Run daily by Vercel Cron (vercel.json): deletes learners' photos and ID
 * documents about six months after their championship ends, and face
 * descriptors after three years (see lib/learner-photos.ts). Vercel
 * sends "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET isn't set" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deleted = await purgeExpiredLearnerPhotos();
  if (deleted.photos + deleted.documents + deleted.faces > 0) {
    await prisma.auditLog.create({
      data: {
        changedBy: null,
        operation: "UPDATE",
        tableName: "learners",
        recordId: "photo-retention",
        newData: {
          photosDeleted: deleted.photos,
          documentsDeleted: deleted.documents,
          faceDescriptorsDeleted: deleted.faces,
          retentionDays: PHOTO_RETENTION_DAYS,
          faceRetentionDays: FACE_RETENTION_DAYS,
        },
      },
    });
  }
  return NextResponse.json({ deleted });
}
