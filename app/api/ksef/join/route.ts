import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthorizationError, getAuthContext, toErrorResponse } from "@/lib/authorize";
import { findUsableInvite } from "@/lib/ksef-invites";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { KSEF_PANEL_ROLE_LABELS } from "@/lib/ksef-config";
import { ksefInviteAcceptSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

const STATE_MESSAGES = {
  ACCEPTED: "This invitation has already been used. Sign in to continue.",
  REVOKED: "This invitation is no longer valid. Ask the KSEF administrator for a new link.",
  EXPIRED: "This invitation has expired. Ask the KSEF administrator for a new link.",
} as const;

function limited(request: Request) {
  return !rateLimit(`ksef-join:${getClientIp(request)}`, 20, 10 * 60_000).allowed;
}

/**
 * Public: what a signup link is for - the edition, invited email and role,
 * and whether that email already has an account (sign in to accept) or
 * needs one created.
 */
export async function GET(request: Request) {
  try {
    if (limited(request)) return NextResponse.json({ error: "Too many attempts - try again in a few minutes" }, { status: 429 });
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const { invite, state } = await findUsableInvite(token);
    if (!invite) return NextResponse.json({ error: "This link isn't valid. Check you copied all of it, or ask for a new one." }, { status: 404 });
    if (state !== "PENDING") return NextResponse.json({ error: STATE_MESSAGES[state], state }, { status: 410 });

    const [account, ctx] = await Promise.all([
      prisma.user.findUnique({ where: { email: invite.email }, select: { id: true } }),
      getAuthContext(),
    ]);
    return NextResponse.json({
      editionName: invite.edition.name,
      email: invite.email,
      name: invite.name,
      phone: invite.phone,
      role: invite.role,
      roleLabel: KSEF_PANEL_ROLE_LABELS[invite.role],
      expiresAt: invite.expiresAt,
      accountExists: !!account,
      signedInAsInvitee: !!ctx && ctx.email.toLowerCase() === invite.email,
      signedInAsSomeoneElse: !!ctx && ctx.email.toLowerCase() !== invite.email,
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * Public: accept an invitation. A new invitee sets their own name and
 * password (their account is created with the invited email). Someone who
 * already has an account must be signed in as that email. Either way they
 * join the panel in the invited role, and the link can't be used again.
 */
export async function POST(request: Request) {
  try {
    if (limited(request)) return NextResponse.json({ error: "Too many attempts - try again in a few minutes" }, { status: 429 });
    const input = ksefInviteAcceptSchema.parse(await request.json());
    const { invite, state } = await findUsableInvite(input.token);
    if (!invite) throw new AuthorizationError("This link isn't valid", 404);
    if (state !== "PENDING") throw new AuthorizationError(STATE_MESSAGES[state], 410);

    const existing = await prisma.user.findUnique({ where: { email: invite.email }, select: { id: true } });
    let userId: string;
    let createdAccount = false;
    if (existing) {
      const ctx = await getAuthContext();
      if (!ctx || ctx.email.toLowerCase() !== invite.email) {
        throw new AuthorizationError(`Sign in as ${invite.email} to accept this invitation`, 401);
      }
      userId = ctx.userId;
    } else {
      if (!input.name || !input.password) throw new Error("Enter your full name and choose a password");
      userId = "";
      createdAccount = true;
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      // Claim the invitation first so a link can only ever be used once,
      // even if it's submitted twice at the same moment.
      const claimed = await tx.ksefJudgeInvite.updateMany({
        where: { id: invite.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { acceptedAt: now },
      });
      if (claimed.count !== 1) throw new AuthorizationError("This invitation has already been used", 410);

      if (createdAccount) {
        const user = await tx.user.create({
          data: {
            email: invite.email,
            name: input.name!,
            phone: input.phone ?? invite.phone ?? null,
            passwordHash: await bcrypt.hash(input.password!, 12),
          },
        });
        userId = user.id;
      }

      await tx.ksefJudge.upsert({
        where: { editionId_userId: { editionId: invite.editionId, userId } },
        create: { editionId: invite.editionId, userId, role: invite.role, specialty: invite.specialty },
        update: { isActive: true, role: invite.role },
      });
      await tx.ksefJudgeInvite.update({ where: { id: invite.id }, data: { acceptedById: userId } });
      await tx.auditLog.create({
        data: {
          changedBy: userId,
          operation: "INSERT",
          tableName: "ksef_judges",
          recordId: invite.id,
          newData: { acceptedInvite: invite.id, editionId: invite.editionId, role: invite.role, createdAccount },
        },
      });
    });

    return NextResponse.json({ joined: true, email: invite.email, createdAccount });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
