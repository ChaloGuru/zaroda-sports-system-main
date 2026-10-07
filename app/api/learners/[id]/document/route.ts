import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { getAuthContext, toErrorResponse } from "@/lib/authorize";
import { assertRegistrationOpen, photoContentType, requireLearnerEditor } from "@/lib/learners";
import { canViewLearner, canViewLinkedLearner } from "@/lib/learner-access";
import { ID_DOCUMENT_KINDS, MAX_DOCUMENT_BYTES } from "@/lib/learner-documents";

export const dynamic = "force-dynamic";

/**
 * A photo of the learner's birth certificate or KNEC record, for officials
 * checking who they are. Like the learner's photo it stays in the database
 * behind this check, and is deleted six months after the championship.
 */
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const learner = await prisma.learner.findUnique({
      where: { id: params.id },
      select: { idDocument: true, schoolId: true, championship: { select: { id: true, tenantId: true } } },
    });
    if (!learner) return NextResponse.json({ error: "Learner not found" }, { status: 404 });
    const ctx = await getAuthContext();
    if (!(await canViewLearner(ctx, learner)) && !(await canViewLinkedLearner(ctx, params.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!learner.idDocument) return NextResponse.json({ error: "No document" }, { status: 404 });

    const bytes = new Uint8Array(learner.idDocument);
    return new Response(bytes, {
      headers: {
        "Content-Type": photoContentType(bytes) ?? "application/octet-stream",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/** Uploads (or replaces) the document - by whoever can change the learner's photo. */
export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const learner = await prisma.learner.findUnique({ where: { id: params.id }, select: { id: true, championshipId: true, schoolId: true } });
    if (!learner) return NextResponse.json({ error: "Learner not found" }, { status: 404 });
    const ctx = await requireLearnerEditor(learner);
    await assertRegistrationOpen(learner.championshipId);

    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_DOCUMENT_BYTES + 16 * 1024) {
      return NextResponse.json({ error: "Document photo must be smaller than 800 KB" }, { status: 413 });
    }
    const formData = await request.formData();
    const file = formData.get("document");
    const kind = formData.get("kind");
    if (!(file instanceof File)) return NextResponse.json({ error: "No document was uploaded" }, { status: 400 });
    if (!ID_DOCUMENT_KINDS.some((k) => k.value === kind)) return NextResponse.json({ error: "Say what kind of document it is" }, { status: 400 });
    if (file.size > MAX_DOCUMENT_BYTES) return NextResponse.json({ error: "Document photo must be smaller than 800 KB" }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!photoContentType(bytes)) return NextResponse.json({ error: "Upload a JPEG, PNG or WebP photo of the document" }, { status: 400 });

    const idDocumentUpdatedAt = new Date();
    await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "learners",
      mutate: (tx) =>
        tx.learner.update({
          where: { id: learner.id },
          data: { idDocument: Buffer.from(bytes), idDocumentKind: kind as string, idDocumentUpdatedAt },
          select: { id: true },
        }),
      recordId: () => learner.id,
      newData: { idDocumentKind: kind, idDocumentUpdatedAt, documentBytes: bytes.length },
    });
    return NextResponse.json({ idDocumentUpdatedAt });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
