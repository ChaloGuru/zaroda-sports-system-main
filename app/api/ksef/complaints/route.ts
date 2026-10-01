import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthorizationError, isSuperAdmin, requireAuth, toErrorResponse } from "@/lib/authorize";
import { getEditableEdition, getPanelMember, recordCaseEvent } from "@/lib/ksef";
import { ksefComplaintSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

/**
 * ?editionId= -> complaints the caller may see: all of them for the KSEF
 * administrator, SRC members and Chief Judges; otherwise only the ones the
 * caller raised.
 */
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const editionId = new URL(request.url).searchParams.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId is required" }, { status: 400 });

    const member = isSuperAdmin(ctx) ? null : await getPanelMember(ctx.userId, editionId);
    if (!isSuperAdmin(ctx) && !member) throw new AuthorizationError("You're not on this edition's panel");
    const seesAll = isSuperAdmin(ctx) || member?.role === "SRC_MEMBER" || member?.role === "CHIEF_JUDGE";

    const complaints = await prisma.ksefComplaint.findMany({
      where: { editionId, ...(seesAll ? {} : { raisedById: ctx.userId }) },
      orderBy: [{ createdAt: "desc" }],
      include: {
        raisedBy: { select: { name: true } },
        decidedBy: { select: { name: true } },
        project: { select: { code: true, title: true, school: { select: { name: true } } } },
      },
    });
    return NextResponse.json({ complaints });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * Records a written complaint for the SRC. Any member of the edition's
 * panel or the KSEF administrator can record one - including on behalf of
 * a school or patron who complained in writing. Raising a complaint never
 * changes any score or result by itself.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const input = ksefComplaintSchema.parse(await request.json());
    await getEditableEdition(input.editionId);
    if (!isSuperAdmin(ctx) && !(await getPanelMember(ctx.userId, input.editionId))) {
      throw new AuthorizationError("Only the KSEF administrator or a member of this edition's panel can record a complaint");
    }

    const competing = await prisma.ksefResult.findUnique({
      where: { projectId_level: { projectId: input.projectId, level: input.level } },
      select: { project: { select: { editionId: true } } },
    });
    if (!competing || competing.project.editionId !== input.editionId) {
      throw new Error("That project didn't compete at that level in this edition");
    }

    const complaint = await prisma.$transaction(async (tx) => {
      const created = await tx.ksefComplaint.create({
        data: { ...input, documentUrl: input.documentUrl ?? null, raisedById: ctx.userId },
      });
      await recordCaseEvent(tx, {
        complaintId: created.id,
        actorId: ctx.userId,
        action: "RAISED",
        note: `Complaint by ${input.complainantName} (${input.complainantRole}): ${input.subject}`,
      });
      await tx.auditLog.create({
        data: { changedBy: ctx.userId, operation: "INSERT", tableName: "ksef_complaints", recordId: created.id, newData: input },
      });
      return created;
    });
    return NextResponse.json({ complaint }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
