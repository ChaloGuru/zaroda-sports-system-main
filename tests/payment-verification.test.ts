import { describe, it, expect, vi, beforeEach } from "vitest";

const subscriptionPlanFindUniqueOrThrow = vi.fn();
const championshipSubscriptionFindFirst = vi.fn();
const championshipSubscriptionUpdate = vi.fn();
const championshipSubscriptionCreate = vi.fn();
const auditLogCreate = vi.fn();
const teamFeePaymentUpdateMany = vi.fn();
const teamFeePaymentUpdate = vi.fn();
const tournamentTeamFindFirst = vi.fn();
const tournamentTeamCreate = vi.fn();

const tx = {
  subscriptionPlan: { findUniqueOrThrow: subscriptionPlanFindUniqueOrThrow },
  championshipSubscription: { findFirst: championshipSubscriptionFindFirst, update: championshipSubscriptionUpdate, create: championshipSubscriptionCreate },
  auditLog: { create: auditLogCreate },
  teamFeePayment: { updateMany: teamFeePaymentUpdateMany, update: teamFeePaymentUpdate },
  tournamentTeam: { findFirst: tournamentTeamFindFirst, create: tournamentTeamCreate },
};

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { activateSubscription, completeTeamFeePayment } = await import("@/lib/payment-verification");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asTx = tx as any;

const TXN = { tenantId: "tenant-1", planId: "plan-1", amountKes: 580, paystackReference: "sub_1" };

describe("activateSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscriptionPlanFindUniqueOrThrow.mockResolvedValue({ id: "plan-1", level: "ZONE", priceKes: 580 });
  });

  it("creates an active subscription with no expiry, waiting for a championship", async () => {
    championshipSubscriptionFindFirst.mockResolvedValue(null);
    await activateSubscription(asTx, TXN, null);
    expect(championshipSubscriptionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: "tenant-1", championshipId: null, status: "ACTIVE", expiresAt: null }) }),
    );
    expect(auditLogCreate).toHaveBeenCalled();
  });

  it("restores the subscription of the championship a payment is for", async () => {
    championshipSubscriptionFindFirst.mockResolvedValue({ id: "existing-sub" });
    await activateSubscription(asTx, TXN, "champ-1");
    expect(championshipSubscriptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "existing-sub" }, data: expect.objectContaining({ status: "ACTIVE" }) }),
    );
    expect(championshipSubscriptionCreate).not.toHaveBeenCalled();
  });
});

const PENDING_TEAM = { name: "Thunder FC", teamCode: "THU", gender: "MIXED", contactName: "Coach", contactEmail: "coach@example.com", contactPhone: "254712345678" };

describe("completeTeamFeePayment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks a fee for an existing team PAID with the M-Pesa receipt, without creating a team", async () => {
    teamFeePaymentUpdateMany.mockResolvedValue({ count: 1 });
    const done = await completeTeamFeePayment(asTx, { id: "payment-1", teamId: "team-1", pendingTeam: null, championshipId: "champ-1" }, { mpesaReceipt: "QAB12CD" });
    expect(done).toBe(true);
    expect(teamFeePaymentUpdateMany).toHaveBeenCalledWith({
      where: { id: "payment-1", status: { not: "PAID" } },
      data: expect.objectContaining({ status: "PAID", mpesaReceipt: "QAB12CD" }),
    });
    expect(tournamentTeamCreate).not.toHaveBeenCalled();
  });

  it("creates a self-registered team only once its payment is confirmed", async () => {
    teamFeePaymentUpdateMany.mockResolvedValue({ count: 1 });
    tournamentTeamFindFirst.mockResolvedValue(null);
    tournamentTeamCreate.mockResolvedValue({ id: "new-team" });
    await completeTeamFeePayment(asTx, { id: "payment-1", teamId: null, pendingTeam: PENDING_TEAM, championshipId: "champ-1" });
    expect(tournamentTeamCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ championshipId: "champ-1", name: "Thunder FC", teamCode: "THU", notes: null }),
    });
    expect(teamFeePaymentUpdate).toHaveBeenCalledWith({ where: { id: "payment-1" }, data: { teamId: "new-team" } });
  });

  it("does not create a second team when a notification repeats", async () => {
    teamFeePaymentUpdateMany.mockResolvedValue({ count: 0 });
    const done = await completeTeamFeePayment(asTx, { id: "payment-1", teamId: null, pendingTeam: PENDING_TEAM, championshipId: "champ-1" });
    expect(done).toBe(false);
    expect(tournamentTeamCreate).not.toHaveBeenCalled();
  });

  it("still registers the team, without its code, if the code was taken while paying", async () => {
    teamFeePaymentUpdateMany.mockResolvedValue({ count: 1 });
    tournamentTeamFindFirst.mockResolvedValue({ id: "someone-else" });
    tournamentTeamCreate.mockResolvedValue({ id: "new-team" });
    await completeTeamFeePayment(asTx, { id: "payment-1", teamId: null, pendingTeam: PENDING_TEAM, championshipId: "champ-1" });
    expect(tournamentTeamCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ teamCode: null, notes: expect.stringContaining("THU") }) });
  });
});
