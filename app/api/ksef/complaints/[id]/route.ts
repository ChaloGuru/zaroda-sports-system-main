import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthorizationError, isSuperAdmin, requireAuth, toErrorResponse, type AuthContext } from "@/lib/authorize";
import { assertEditionEditable, getPanelMember, isAssignedToProject, recordCaseEvent } from "@/lib/ksef";
import { ksefComplaintActionSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

async function loadForCaller(id: string, ctx: AuthContext) {
  const complaint = await prisma.ksefComplaint.findUnique({ where: { id }, include: { edition: true } });
  if (!complaint) throw new AuthorizationError("Complaint not found", 404);
  const member = isSuperAdmin(ctx) ? null : await getPanelMember(ctx.userId, complaint.editionId);
  const seesAll = isSuperAdmin(ctx) || member?.role === "SRC_MEMBER" || member?.role === "CHIEF_JUDGE";
  if (!seesAll && complaint.raisedById !== ctx.userId) throw new AuthorizationError("Complaint not found", 404);
  return { complaint, member };
}

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await requireAuth();
    const { complaint, member } = await loadForCaller(params.id, ctx);
    const [detail, events] = await Promise.all([
      prisma.ksefComplaint.findUnique({
        where: { id: complaint.id },
        include: {
          raisedBy: { select: { name: true } },
          decidedBy: { select: { name: true } },
          project: {
            select: {
              code: true,
              title: true,
              category: { select: { name: true } },
              school: { select: { name: true, subcounty: true, county: true } },
            },
          },
        },
      }),
      prisma.ksefCaseEvent.findMany({
        where: { complaintId: complaint.id },
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { name: true } } },
      }),
    ]);
    const conflicted = await isAssignedToProject(ctx.userId, complaint.projectId, complaint.level);
    const canDecide = (isSuperAdmin(ctx) || member?.role === "SRC_MEMBER") && !conflicted && complaint.edition.status !== "CLOSED";
    return NextResponse.json({
      complaint: detail,
      events: events.map((e) => ({ id: e.id, action: e.action, note: e.note, actor: e.actor?.name ?? "System", createdAt: e.createdAt })),
      permissions: {
        canNote: complaint.edition.status !== "CLOSED",
        canDecide,
        canReopen: isSuperAdmin(ctx) && complaint.edition.status !== "CLOSED",
        conflicted,
      },
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * - NOTE: anyone who can see the complaint adds a written note.
 * - START_REVIEW / DECIDE: the SRC (or the KSEF administrator). An SRC
 *   member judging the project can't decide on it. A decision must be given
 *   in writing. It doesn't change any score - if action is needed, it's taken
 *   through the Chief Judge review or by re-judging, which are recorded separately.
 * - REOPEN: the KSEF administrator reopens a decided complaint.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await requireAuth();
    const { complaint, member } = await loadForCaller(params.id, ctx);
    assertEditionEditable(complaint.edition);
    const input = ksefComplaintActionSchema.parse(await request.json());

    const isSrc = isSuperAdmin(ctx) || member?.role === "SRC_MEMBER";
    let update: Record<string, unknown> | null = null;
    let event: { action: string; note: string | null };

    switch (input.action) {
      case "NOTE":
        event = { action: "NOTE", note: input.note };
        break;
      case "START_REVIEW":
        if (!isSrc) throw new AuthorizationError("Only the SRC can take up a complaint");
        if (complaint.status !== "SUBMITTED") throw new Error("This complaint is already under review or decided");
        update = { status: "UNDER_REVIEW" };
        event = { action: "UNDER_REVIEW", note: input.note ?? null };
        break;
      case "DECIDE":
        if (!isSrc) throw new AuthorizationError("Only the SRC can decide a complaint");
        if (await isAssignedToProject(ctx.userId, complaint.projectId, complaint.level)) {
          throw new AuthorizationError("You're judging this project, so another SRC member must decide this complaint");
        }
        if (complaint.status === "UPHELD" || complaint.status === "DISMISSED") throw new Error("This complaint has already been decided");
        update = { status: input.outcome, decision: input.decision, decidedById: ctx.userId, decidedAt: new Date() };
        event = { action: input.outcome, note: input.decision };
        break;
      case "REOPEN":
        if (!isSuperAdmin(ctx)) throw new AuthorizationError("Only the KSEF administrator can reopen a decided complaint");
        if (complaint.status !== "UPHELD" && complaint.status !== "DISMISSED") throw new Error("Only a decided complaint can be reopened");
        update = { status: "UNDER_REVIEW", decision: null, decidedById: null, decidedAt: null };
        event = {
          action: "REOPENED",
          note: `Previous decision (${complaint.status.toLowerCase()}): ${complaint.decision ?? "-"}. Reason for reopening: ${input.note}`,
        };
        break;
    }

    await prisma.$transaction(async (tx) => {
      if (update) await tx.ksefComplaint.update({ where: { id: complaint.id }, data: update });
      await recordCaseEvent(tx, { complaintId: complaint.id, actorId: ctx.userId, ...event });
      await tx.auditLog.create({
        data: {
          changedBy: ctx.userId,
          operation: update ? "UPDATE" : "INSERT",
          tableName: update ? "ksef_complaints" : "ksef_case_events",
          recordId: complaint.id,
          oldData: { status: complaint.status, decision: complaint.decision },
          newData: input,
        },
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
