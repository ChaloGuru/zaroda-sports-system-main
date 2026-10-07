import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { getAuthContext, canViewChampionshipPrivateData, managedTeamSchoolIds, toErrorResponse } from "@/lib/authorize";
import { MAX_PHOTO_BYTES, assertRegistrationOpen, photoContentType, requireLearnerEditor } from "@/lib/learners";

export const dynamic = "force-dynamic";

/**
 * A learner's photo, for officials checking identity. Photos of children
 * stay in the database behind this check rather than at a public file URL.
 */
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const learner = await prisma.learner.findUnique({
      where: { id: params.id },
      select: { photo: true, schoolId: true, championship: { select: { id: true, tenantId: true } } },
    });
    if (!learner) return NextResponse.json({ error: "Learner not found" }, { status: 404 });
    const ctx = await getAuthContext();
    const isTeamManager =
      !!ctx && !!learner.schoolId && (await managedTeamSchoolIds(ctx, learner.championship.id)).includes(learner.schoolId);
    if (!isTeamManager && !(await canViewChampionshipPrivateData(ctx, learner.championship))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!learner.photo) return NextResponse.json({ error: "No photo" }, { status: 404 });

    const bytes = new Uint8Array(learner.photo);
    return new Response(bytes, {
      headers: {
        "Content-Type": photoContentType(bytes) ?? "application/octet-stream",
        // Never stored by shared caches; the URL changes when the photo does.
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * Sets the photo at registration - by the championship's admins and
 * scorekeepers, or the learner's school team manager. Call-room roles can't
 * change it, so a learner's photo can't be replaced with whoever turns up.
 */
export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const learner = await prisma.learner.findUnique({ where: { id: params.id }, select: { id: true, championshipId: true, schoolId: true } });
    if (!learner) return NextResponse.json({ error: "Learner not found" }, { status: 404 });
    const ctx = await requireLearnerEditor(learner);
    await assertRegistrationOpen(learner.championshipId);

    // Photos arrive resized to well under the limit; refuse anything bigger
    // before reading it into memory.
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_PHOTO_BYTES + 16 * 1024) {
      return NextResponse.json({ error: "Photo must be smaller than 300 KB" }, { status: 413 });
    }
    const formData = await request.formData();
    const file = formData.get("photo");
    if (!(file instanceof File)) return NextResponse.json({ error: "No photo was uploaded" }, { status: 400 });
    if (file.size > MAX_PHOTO_BYTES) return NextResponse.json({ error: "Photo must be smaller than 300 KB" }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!photoContentType(bytes)) return NextResponse.json({ error: "Photo must be a JPEG, PNG or WebP image" }, { status: 400 });

    const photoUpdatedAt = new Date();
    await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "learners",
      mutate: (tx) => tx.learner.update({ where: { id: learner.id }, data: { photo: Buffer.from(bytes), photoUpdatedAt }, select: { id: true } }),
      recordId: () => learner.id,
      newData: { photoUpdatedAt, photoBytes: bytes.length },
    });
    return NextResponse.json({ photoUpdatedAt });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
