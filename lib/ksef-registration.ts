import { randomBytes } from "crypto";
import type { KsefEdition } from "@prisma/client";
import { AuthorizationError } from "./authorize";
import { escapeHtml } from "./email";
import { hashInviteToken } from "./ksef-invites";
import { prisma } from "./prisma";

// KSEF school self-registration. Two kinds of link:
//
// - The edition's OPEN link (/ksef/register/<token>), shared with schools
//   publicly. It only collects a school's details and contact email - it
//   can't see or change anything.
// - Each registration's PRIVATE portal link (/ksef/school/<token>), emailed to
//   the contact (only its hash is stored). Whoever holds it can enter that
//   school's projects - and only the projects it created itself.
//
// A registration is PENDING until the KSEF administrator approves the school;
// only then can its projects be submitted for judging.

export { PORTAL_TOKEN_HEADER, MAX_REGISTERED_LEARNERS } from "./ksef-portal-client";
import { PORTAL_TOKEN_HEADER } from "./ksef-portal-client";

export function newRegistrationLinkToken(): string {
  return randomBytes(24).toString("base64url");
}

/** A fresh private portal token and the hash that's stored. */
export function newPortalToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

/**
 * Absolute links are always built from PUBLIC_SITE_URL, never the request's
 * Host header - otherwise a forged Host could send a school's private link
 * to someone else's domain.
 */
function siteUrl(path: string): string {
  const base = process.env.PUBLIC_SITE_URL;
  if (!base) throw new Error("PUBLIC_SITE_URL is not configured");
  return `${base.replace(/\/$/, "")}${path}`;
}

export const registrationUrl = (token: string) => siteUrl(`/ksef/register/${token}`);
export const portalUrl = (token: string) => siteUrl(`/ksef/school/${token}`);

type RegistrationWindow = Pick<KsefEdition, "status" | "registrationToken" | "registrationClosesAt">;

export function isRegistrationOpen(edition: RegistrationWindow, now = new Date()): boolean {
  return (
    !!edition.registrationToken &&
    edition.status !== "CLOSED" &&
    (!edition.registrationClosesAt || edition.registrationClosesAt > now)
  );
}

/** The registration (with its edition) a private portal token belongs to, or null. */
export async function findPortalRegistration(token: string | null | undefined) {
  if (!token) return null;
  return prisma.ksefSchoolRegistration.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { edition: true },
  });
}

/** Loads the caller's registration from the portal token header, or throws 401. */
export async function requirePortalRegistration(request: Request) {
  const registration = await findPortalRegistration(request.headers.get(PORTAL_TOKEN_HEADER));
  if (!registration) {
    throw new AuthorizationError("This school link isn't valid any more. Use the registration page to get a new one emailed to you.", 401);
  }
  return registration;
}

/** Throws unless the school may still change its entries. */
export function assertPortalWritable(registration: { status: string; edition: RegistrationWindow & { name: string } }): void {
  if (registration.status === "REJECTED") {
    throw new AuthorizationError("This registration was not accepted, so its entries can't be changed", 409);
  }
  if (registration.edition.status === "CLOSED") {
    throw new AuthorizationError(`${registration.edition.name} is closed`, 409);
  }
  const closesAt = registration.edition.registrationClosesAt;
  if (closesAt && closesAt <= new Date()) {
    throw new AuthorizationError(`Registration for ${registration.edition.name} has closed - contact the KSEF administrator for changes`, 409);
  }
}

/**
 * True for a URL our own upload endpoint produced (Vercel Blob). School-entered
 * document links are restricted to these so a school can't plant arbitrary
 * (e.g. javascript:) links that administrators and judges then click.
 */
export function isOwnUploadUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

/** The email carrying a school's private portal link. */
export function portalEmail(details: { contactName: string; schoolName: string; editionName: string; url: string }) {
  const subject = `Your ${details.editionName} registration link for ${details.schoolName}`;
  const text =
    `Hello ${details.contactName},\n\n${details.schoolName} is registered for ${details.editionName} on Zaroda Sports.\n\n` +
    `Use this private link to enter and update your school's projects:\n${details.url}\n\n` +
    "Keep it to yourself - anyone with the link can change your school's entries. " +
    "If you need a new one, request it again from the registration page and this one will stop working.\n\nZaroda Sports";
  const e = escapeHtml;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1a2e5a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:8px;padding:28px">
<tr><td>
<p style="margin:0 0 16px;font-size:18px;font-weight:bold">${e(details.editionName)} school registration</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Hello ${e(details.contactName)},</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5"><strong>${e(details.schoolName)}</strong> is registered for <strong>${e(details.editionName)}</strong>. Use your school's private link to enter and update its projects.</p>
<p style="margin:0 0 24px"><a href="${e(details.url)}" style="display:inline-block;background:#1a2e5a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;font-size:15px">Enter our projects</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#4a5278;line-height:1.5">Keep this link to yourself - anyone with it can change your school's entries. If the button doesn't work, copy this address into your browser:</p>
<p style="margin:0 0 20px;font-size:12px;word-break:break-all;color:#4a5278">${e(details.url)}</p>
<p style="margin:0;font-size:12px;color:#7a82a8">If you didn't register this school, you can ignore this email.</p>
</td></tr></table>
<p style="font-size:12px;color:#7a82a8;margin:16px 0 0">Zaroda Sports</p>
</td></tr></table></body></html>`;
  return { subject, text, html };
}
