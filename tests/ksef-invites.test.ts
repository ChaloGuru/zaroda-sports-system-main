import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { hashInviteToken, inviteExpiry, inviteState, newInviteToken, INVITE_TTL_DAYS } from "@/lib/ksef-invites";
import { ksefInviteAcceptSchema, ksefScoreSheetSchema } from "@/lib/validations";

describe("KSEF invite tokens", () => {
  it("stores only a hash of an unguessable, unique token", () => {
    const a = newInviteToken();
    const b = newInviteToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(40);
    expect(a.tokenHash).toBe(hashInviteToken(a.token));
    expect(a.tokenHash).not.toContain(a.token);
  });

  it("expires after the configured number of days", () => {
    const from = new Date("2026-10-01T00:00:00Z");
    expect(inviteExpiry(from).getTime() - from.getTime()).toBe(INVITE_TTL_DAYS * 86_400_000);
  });

  it("reports accepted > revoked > expired > pending", () => {
    const future = new Date(Date.now() + 60_000);
    const past = new Date(Date.now() - 60_000);
    expect(inviteState({ acceptedAt: null, revokedAt: null, expiresAt: future })).toBe("PENDING");
    expect(inviteState({ acceptedAt: null, revokedAt: null, expiresAt: past })).toBe("EXPIRED");
    expect(inviteState({ acceptedAt: null, revokedAt: new Date(), expiresAt: future })).toBe("REVOKED");
    expect(inviteState({ acceptedAt: new Date(), revokedAt: new Date(), expiresAt: past })).toBe("ACCEPTED");
  });

  it("requires a strong password when a new account is created", () => {
    expect(ksefInviteAcceptSchema.safeParse({ token: "x".repeat(43), password: "weak" }).success).toBe(false);
    expect(ksefInviteAcceptSchema.safeParse({ token: "x".repeat(43), name: "A Judge", password: "Str0ngPass" }).success).toBe(true);
  });
});

describe("score sheet input", () => {
  const sheet = (score: number) => ({ scores: [{ criterionId: "00000000-0000-4000-8000-000000000000", score }] });

  it("rejects negative scores and more than 2 decimal places", () => {
    expect(ksefScoreSheetSchema.safeParse(sheet(-1)).success).toBe(false);
    expect(ksefScoreSheetSchema.safeParse(sheet(12.345)).success).toBe(false);
    expect(ksefScoreSheetSchema.safeParse(sheet(12.5)).success).toBe(true);
    expect(ksefScoreSheetSchema.safeParse(sheet(0)).success).toBe(true);
  });
});
