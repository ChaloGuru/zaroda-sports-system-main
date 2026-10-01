import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { toErrorResponse } from "@/lib/authorize";
import { getEditableEdition, requireKsefAdmin } from "@/lib/ksef";
import { inviteExpiry, inviteState, inviteUrl, newInviteToken } from "@/lib/ksef-invites";
import { ksefInviteSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

/** ?editionId= -> the edition's panel invitations (never their links - only hashes are stored). */
export async function GET(request: Request) {
  try {
    await requireKsefAdmin();
    const editionId = new URL(request.url).searchParams.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId is required" }, { status: 400 });

    const invites = await prisma.ksefJudgeInvite.findMany({
      where: { editionId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
        acceptedBy: { select: { name: true } },
      },
    });
    return NextResponse.json({ invites: invites.map((i) => ({ ...i, state: inviteState(i) })) });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * Invites someone to the edition's panel. Returns the one-time signup link
 * for the administrator to send - it can't be shown again later (regenerate
 * a new one instead). Any earlier pending invitation for the same email in
 * this edition is revoked.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireKsefAdmin();
    const input = ksefInviteSchema.parse(await request.json());
    await getEditableEdition(input.editionId);

    const alreadyOnPanel = await prisma.ksefJudge.findFirst({
      where: { editionId: input.editionId, user: { email: input.email } },
      select: { id: true },
    });
    if (alreadyOnPanel) throw new Error("That email is already on this edition's panel");

    const { token, tokenHash } = newInviteToken();
    const invite = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "ksef_judge_invites",
      mutate: async (tx) => {
        await tx.ksefJudgeInvite.updateMany({
          where: { editionId: input.editionId, email: input.email, acceptedAt: null, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return tx.ksefJudgeInvite.create({
          data: {
            editionId: input.editionId,
            email: input.email,
            name: input.name ?? null,
            phone: input.phone ?? null,
            specialty: input.specialty ?? null,
            role: input.role,
            tokenHash,
            expiresAt: inviteExpiry(),
            createdById: ctx.userId,
          },
        });
      },
      recordId: (result) => result.id,
      newData: input,
    });

    return NextResponse.json({ invite: { id: invite.id, email: invite.email, expiresAt: invite.expiresAt }, url: inviteUrl(request, token) }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
