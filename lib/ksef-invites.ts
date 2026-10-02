import { createHash, randomBytes } from "crypto";
import { escapeHtml } from "./email";
import { prisma } from "./prisma";

/** How long a KSEF panel signup link stays valid. */
export const INVITE_TTL_DAYS = 14;

/** A fresh unguessable token for a signup link, and the hash that's stored. */
export function newInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteExpiry(from = new Date()): Date {
  return new Date(from.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** Absolute signup link - PUBLIC_SITE_URL when configured, else the request's own origin. */
export function inviteUrl(request: Request, token: string): string {
  const base = process.env.PUBLIC_SITE_URL ?? new URL(request.url).origin;
  return `${base.replace(/\/$/, "")}/ksef/join/${token}`;
}

export type InviteState = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export function inviteState(invite: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date }): InviteState {
  if (invite.acceptedAt) return "ACCEPTED";
  if (invite.revokedAt) return "REVOKED";
  if (invite.expiresAt <= new Date()) return "EXPIRED";
  return "PENDING";
}

/** The pending, usable invitation for a raw link token, with its edition - or null. */
export async function findUsableInvite(token: string) {
  const invite = await prisma.ksefJudgeInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { edition: { select: { id: true, name: true, status: true } } },
  });
  if (!invite) return { invite: null, state: null } as const;
  const state = invite.edition.status === "CLOSED" ? ("REVOKED" as const) : inviteState(invite);
  return { invite, state } as const;
}

/** The panel invitation email: one button to the signup link, plus a plain-text version. */
export function inviteEmail(invite: { email: string; name: string | null; roleLabel: string; editionName: string; url: string }) {
  const greeting = invite.name ? `Hello ${invite.name},` : "Hello,";
  const subject = `You're invited to the ${invite.editionName} judging panel`;
  const text =
    `${greeting}\n\nYou've been invited to join the ${invite.editionName} panel on Zaroda Sports as a ${invite.roleLabel}.\n\n` +
    `Set up your account here (this link is for ${invite.email} only, works once and expires in ${INVITE_TTL_DAYS} days):\n${invite.url}\n\n` +
    "If you weren't expecting this, you can ignore this email.\n\nZaroda Sports";
  const e = escapeHtml;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1a2e5a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:8px;padding:28px">
<tr><td>
<p style="margin:0 0 16px;font-size:18px;font-weight:bold">${e(invite.editionName)} judging panel</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${e(greeting)}</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5">You've been invited to join the <strong>${e(invite.editionName)}</strong> panel on Zaroda Sports as a <strong>${e(invite.roleLabel)}</strong>. Set your own password to get started.</p>
<p style="margin:0 0 24px"><a href="${e(invite.url)}" style="display:inline-block;background:#1a2e5a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;font-size:15px">Set up my account</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#4a5278;line-height:1.5">This link is for ${e(invite.email)} only, works once and expires in ${INVITE_TTL_DAYS} days. If the button doesn't work, copy this address into your browser:</p>
<p style="margin:0 0 20px;font-size:12px;word-break:break-all;color:#4a5278">${e(invite.url)}</p>
<p style="margin:0;font-size:12px;color:#7a82a8">If you weren't expecting this, you can ignore this email.</p>
</td></tr></table>
<p style="font-size:12px;color:#7a82a8;margin:16px 0 0">Zaroda Sports</p>
</td></tr></table></body></html>`;
  return { subject, text, html };
}
