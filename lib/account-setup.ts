import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { passwordFingerprint } from "./auth";
import { escapeHtml } from "./email";
import { prisma } from "./prisma";

// Account setup links for officials added through Roles. The assigning admin
// never chooses (or sees) the password: the account starts with an unusable
// random one, and only whoever receives the emailed link can set theirs - so
// nobody can pre-create an account for someone else's email and keep a way in.
//
// The link is stateless: an HMAC-signed user id + expiry + fingerprint of the
// current password hash. Setting the password changes that hash, so each
// link works once.

/** How long an account setup link stays valid. */
export const SETUP_TTL_DAYS = 7;

interface SetupPayload {
  /** user id */
  u: string;
  /** passwordFingerprint() of the hash the link was issued against */
  f: string;
  /** expiry, epoch ms */
  e: number;
}

function signingKey(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not configured");
  return `account-setup:${secret}`;
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

/** A hash no password can match - for accounts whose owner hasn't set one yet. */
export function unusablePasswordHash(): Promise<string> {
  return bcrypt.hash(randomBytes(32).toString("base64url"), 12);
}

export function createSetupToken(user: { id: string; passwordHash: string }, now = Date.now()): string {
  const payload: SetupPayload = { u: user.id, f: passwordFingerprint(user.passwordHash), e: now + SETUP_TTL_DAYS * 24 * 60 * 60 * 1000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

/** The user a setup link is for, or null if it's forged, expired or already used. */
export async function findSetupUser(token: string) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = Buffer.from(sign(encoded));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  let payload: SetupPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SetupPayload;
  } catch {
    return null;
  }
  if (typeof payload.u !== "string" || typeof payload.e !== "number" || payload.e <= Date.now()) return null;

  const user = await prisma.user.findUnique({ where: { id: payload.u } });
  if (!user || passwordFingerprint(user.passwordHash) !== payload.f) return null;
  return user;
}

/**
 * Absolute setup link. Always built from PUBLIC_SITE_URL, never the request's
 * Host header - the caller is an untrusted tenant admin, and a forged Host
 * would otherwise send the link (and its token) to their own domain.
 */
export function setupUrl(token: string): string {
  const base = process.env.PUBLIC_SITE_URL;
  if (!base) throw new Error("PUBLIC_SITE_URL is not configured");
  return `${base.replace(/\/$/, "")}/account/setup/${token}`;
}

/** The "set up your account" email for a newly added official. */
export function setupEmail(details: { name: string; roleLabel: string; championshipName: string; url: string }) {
  const subject = `You've been added to ${details.championshipName} on Zaroda Sports`;
  const text =
    `Hello ${details.name},\n\nYou've been added to ${details.championshipName} on Zaroda Sports as ${details.roleLabel}.\n\n` +
    `Choose your password to set up your account (this link works once and expires in ${SETUP_TTL_DAYS} days):\n${details.url}\n\n` +
    "If you weren't expecting this, you can ignore this email.\n\nZaroda Sports";
  const e = escapeHtml;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1a2e5a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:8px;padding:28px">
<tr><td>
<p style="margin:0 0 16px;font-size:18px;font-weight:bold">${e(details.championshipName)}</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Hello ${e(details.name)},</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5">You've been added to <strong>${e(details.championshipName)}</strong> on Zaroda Sports as <strong>${e(details.roleLabel)}</strong>. Choose your password to get started.</p>
<p style="margin:0 0 24px"><a href="${e(details.url)}" style="display:inline-block;background:#1a2e5a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;font-size:15px">Set up my account</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#4a5278;line-height:1.5">This link works once and expires in ${SETUP_TTL_DAYS} days. If the button doesn't work, copy this address into your browser:</p>
<p style="margin:0 0 20px;font-size:12px;word-break:break-all;color:#4a5278">${e(details.url)}</p>
<p style="margin:0;font-size:12px;color:#7a82a8">If you weren't expecting this, you can ignore this email.</p>
</td></tr></table>
<p style="font-size:12px;color:#7a82a8;margin:16px 0 0">Zaroda Sports</p>
</td></tr></table></body></html>`;
  return { subject, text, html };
}
