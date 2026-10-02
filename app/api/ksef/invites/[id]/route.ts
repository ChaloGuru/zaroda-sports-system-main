import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { AuthorizationError, toErrorResponse } from "@/lib/authorize";
import { getEditableEdition, requireKsefAdmin } from "@/lib/ksef";
import { sendEmail } from "@/lib/email";
import { KSEF_PANEL_ROLE_LABELS } from "@/lib/ksef-config";
import { inviteEmail, inviteExpiry, inviteUrl, newInviteToken } from "@/lib/ksef-invites";

export const dynamic = "force-dynamic";

const actionSchema = z.object({ action: z.enum(["REGENERATE", "REVOKE"]) });

/**
 * REGENERATE: issue a fresh link (and a fresh 14-day window), emailed to the
 * invitee when email is set up - the old link stops working. REVOKE: cancel the invitation. Accepted invitations can't
 * be changed.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await requireKsefAdmin();
    const { action } = actionSchema.parse(await request.json());
    const existing = await prisma.ksefJudgeInvite.findUnique({ where: { id: params.id } });
    if (!existing) throw new AuthorizationError("Invitation not found", 404);
    const edition = await getEditableEdition(existing.editionId);
    if (existing.acceptedAt) throw new Error("This invitation has already been accepted");

    if (action === "REVOKE") {
      await withAudit({
        actorId: ctx.userId,
        operation: "UPDATE",
        tableName: "ksef_judge_invites",
        oldData: { revokedAt: existing.revokedAt },
        mutate: (tx) => tx.ksefJudgeInvite.update({ where: { id: existing.id }, data: { revokedAt: new Date() } }),
        recordId: (result) => result.id,
        newData: { action },
      });
      return NextResponse.json({ revoked: true });
    }

    const alreadyOnPanel = await prisma.ksefJudge.findFirst({
      where: { editionId: existing.editionId, user: { email: existing.email } },
      select: { id: true },
    });
    if (alreadyOnPanel) throw new Error("That email is already on this edition's panel");

    const { token, tokenHash } = newInviteToken();
    await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "ksef_judge_invites",
      oldData: { expiresAt: existing.expiresAt, revokedAt: existing.revokedAt },
      mutate: async (tx) => {
        // Only one live link per person per edition.
        await tx.ksefJudgeInvite.updateMany({
          where: { editionId: existing.editionId, email: existing.email, id: { not: existing.id }, acceptedAt: null, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return tx.ksefJudgeInvite.update({
          where: { id: existing.id },
          data: { tokenHash, expiresAt: inviteExpiry(), revokedAt: null },
        });
      },
      recordId: (result) => result.id,
      newData: { action },
    });
    const url = inviteUrl(request, token);
    const email = await sendEmail({
      to: existing.email,
      ...inviteEmail({ email: existing.email, name: existing.name, roleLabel: KSEF_PANEL_ROLE_LABELS[existing.role], editionName: edition.name, url }),
    });
    return NextResponse.json({ url, emailed: email.sent, emailError: email.error ?? null });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
