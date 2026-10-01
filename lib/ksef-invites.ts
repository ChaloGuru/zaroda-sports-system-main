import { createHash, randomBytes } from "crypto";
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
