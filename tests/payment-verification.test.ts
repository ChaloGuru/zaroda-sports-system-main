import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyPaystackTransactionMock = vi.fn();

vi.mock("@/lib/paystack", () => ({
  verifyPaystackTransaction: (...args: unknown[]) => verifyPaystackTransactionMock(...args),
  kesToKobo: (amountKes: number) => Math.round(amountKes * 100),
  computeSubscriptionExpiry: (from: Date = new Date()) => new Date(from.getTime() + 365 * 24 * 60 * 60 * 1000),
}));

const paymentTransactionUpdateMany = vi.fn();
const paymentTransactionFindUnique = vi.fn();
const paymentTransactionUpdate = vi.fn();
const teamFeePaymentUpdateMany = vi.fn();
const teamFeePaymentFindFirst = vi.fn();
const teamFeePaymentUpdate = vi.fn();
const subscriptionPlanFindUniqueOrThrow = vi.fn();
const championshipSubscriptionFindFirst = vi.fn();
const championshipSubscriptionUpdate = vi.fn();
const championshipSubscriptionCreate = vi.fn();
const auditLogCreate = vi.fn();
const txTeamFeePaymentUpdateMany = vi.fn();
const txTeamFeePaymentUpdate = vi.fn();
const txTournamentTeamFindFirst = vi.fn();
const txTournamentTeamCreate = vi.fn();

const txClient = {
  paymentTransaction: { update: paymentTransactionUpdate },
  subscriptionPlan: { findUniqueOrThrow: subscriptionPlanFindUniqueOrThrow },
  championshipSubscription: { findFirst: championshipSubscriptionFindFirst, update: championshipSubscriptionUpdate, create: championshipSubscriptionCreate },
  auditLog: { create: auditLogCreate },
  teamFeePayment: { updateMany: txTeamFeePaymentUpdateMany, update: txTeamFeePaymentUpdate },
  tournamentTeam: { findFirst: txTournamentTeamFindFirst, create: txTournamentTeamCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    paymentTransaction: { updateMany: paymentTransactionUpdateMany, findUnique: paymentTransactionFindUnique },
    teamFeePayment: { updateMany: teamFeePaymentUpdateMany, findFirst: teamFeePaymentFindFirst, update: teamFeePaymentUpdate },
    $transaction: (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient),
  },
}));

const { verifyAndRecordPayment } = await import("@/lib/payment-verification");

function paystackResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    status: true,
    message: "ok",
    data: {
      status: "success",
      reference: "ref1",
      amount: 58_000,
      currency: "KES",
      metadata: { mode: "subscription" },
      gateway_response: "Successful",
      paid_at: "2026-01-01T00:00:00.000Z",
      ...overrides,
    },
  };
}

describe("verifyAndRecordPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks a subscription transaction FAILED when Paystack reports a non-success status", async () => {
    verifyPaystackTransactionMock.mockResolvedValue(
      paystackResponse({ status: "failed", gateway_response: "Declined", metadata: { mode: "subscription" } }),
    );

    const result = await verifyAndRecordPayment("ref1");

    expect(result.success).toBe(false);
    expect(result.message).toBe("Declined");
    expect(paymentTransactionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
  });

  it("marks a team_fee payment FAILED when Paystack reports a non-success status", async () => {
    verifyPaystackTransactionMock.mockResolvedValue(
      paystackResponse({ status: "failed", gateway_response: "Insufficient funds", metadata: { mode: "team_fee" } }),
    );

    const result = await verifyAndRecordPayment("ref2");

    expect(result.success).toBe(false);
    expect(teamFeePaymentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "FAILED" } }),
    );
  });

  it("activates a subscription on a successful subscription payment (new subscription)", async () => {
    verifyPaystackTransactionMock.mockResolvedValue(
      paystackResponse({ metadata: { mode: "subscription", tenantId: "tenant-1", planId: "plan-1" } }),
    );
    paymentTransactionFindUnique.mockResolvedValue({
      id: "txn-1",
      tenantId: "tenant-1",
      planId: "plan-1",
      status: "PENDING",
      amountKes: 580,
    });
    subscriptionPlanFindUniqueOrThrow.mockResolvedValue({ id: "plan-1", level: "ZONE", priceKes: 580 });
    championshipSubscriptionFindFirst.mockResolvedValue(null);

    const result = await verifyAndRecordPayment("ref1");

    expect(result.success).toBe(true);
    expect(result.mode).toBe("subscription");
    expect(paymentTransactionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PAID" }) }),
    );
    expect(championshipSubscriptionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ACTIVE", tenantId: "tenant-1" }) }),
    );
    expect(auditLogCreate).toHaveBeenCalled();
  });

  it("extends an existing subscription rather than creating a duplicate", async () => {
    verifyPaystackTransactionMock.mockResolvedValue(
      paystackResponse({ metadata: { mode: "subscription", tenantId: "tenant-1", planId: "plan-1" } }),
    );
    paymentTransactionFindUnique.mockResolvedValue({
      id: "txn-1",
      tenantId: "tenant-1",
      planId: "plan-1",
      status: "PENDING",
      amountKes: 580,
    });
    subscriptionPlanFindUniqueOrThrow.mockResolvedValue({ id: "plan-1", level: "ZONE", priceKes: 580 });
    championshipSubscriptionFindFirst.mockResolvedValue({ id: "existing-sub" });

    await verifyAndRecordPayment("ref1");

    expect(championshipSubscriptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "existing-sub" }, data: expect.objectContaining({ status: "ACTIVE" }) }),
    );
    expect(championshipSubscriptionCreate).not.toHaveBeenCalled();
  });

  it("is idempotent when the transaction is already marked PAID", async () => {
    verifyPaystackTransactionMock.mockResolvedValue(
      paystackResponse({ metadata: { mode: "subscription", tenantId: "tenant-1", planId: "plan-1" } }),
    );
    paymentTransactionFindUnique.mockResolvedValue({
      id: "txn-1",
      tenantId: "tenant-1",
      planId: "plan-1",
      status: "PAID",
      amountKes: 580,
    });

    const result = await verifyAndRecordPayment("ref1");

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/already verified/);
    expect(paymentTransactionUpdate).not.toHaveBeenCalled();
  });

  it("marks a team fee payment for an existing team PAID without creating a team", async () => {
    verifyPaystackTransactionMock.mockResolvedValue(
      paystackResponse({ metadata: { mode: "team_fee", teamId: "team-1", feeId: "fee-1" } }),
    );
    teamFeePaymentFindFirst.mockResolvedValue({ id: "payment-1", status: "PENDING", teamId: "team-1", pendingTeam: null, amountKes: 580 });
    txTeamFeePaymentUpdateMany.mockResolvedValue({ count: 1 });

    const result = await verifyAndRecordPayment("ref3");

    expect(result.success).toBe(true);
    expect(txTeamFeePaymentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "payment-1", status: { not: "PAID" } },
        data: expect.objectContaining({ status: "PAID" }),
      }),
    );
    expect(txTournamentTeamCreate).not.toHaveBeenCalled();
  });

  const PENDING_TEAM = {
    name: "Thunder FC",
    teamCode: "THU",
    gender: "MIXED",
    contactName: "Coach",
    contactEmail: "coach@example.com",
    contactPhone: null,
  };

  it("creates a self-registered team only once its payment is confirmed", async () => {
    verifyPaystackTransactionMock.mockResolvedValue(paystackResponse({ metadata: { mode: "team_fee", feeId: "fee-1" } }));
    teamFeePaymentFindFirst.mockResolvedValue({
      id: "payment-1",
      status: "PENDING",
      teamId: null,
      championshipId: "champ-1",
      pendingTeam: PENDING_TEAM,
      amountKes: 580,
    });
    txTeamFeePaymentUpdateMany.mockResolvedValue({ count: 1 });
    txTournamentTeamFindFirst.mockResolvedValue(null);
    txTournamentTeamCreate.mockResolvedValue({ id: "new-team" });

    const result = await verifyAndRecordPayment("ref4");

    expect(result.success).toBe(true);
    expect(txTournamentTeamCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ championshipId: "champ-1", name: "Thunder FC", teamCode: "THU", notes: null }),
    });
    expect(txTeamFeePaymentUpdate).toHaveBeenCalledWith({ where: { id: "payment-1" }, data: { teamId: "new-team" } });
  });

  it("does not create a second team when the webhook and redirect verify race", async () => {
    verifyPaystackTransactionMock.mockResolvedValue(paystackResponse({ metadata: { mode: "team_fee", feeId: "fee-1" } }));
    teamFeePaymentFindFirst.mockResolvedValue({
      id: "payment-1",
      status: "PENDING",
      teamId: null,
      championshipId: "champ-1",
      pendingTeam: PENDING_TEAM,
      amountKes: 580,
    });
    // The other request already claimed (marked PAID) this payment.
    txTeamFeePaymentUpdateMany.mockResolvedValue({ count: 0 });

    const result = await verifyAndRecordPayment("ref4");

    expect(result.success).toBe(true);
    expect(txTournamentTeamCreate).not.toHaveBeenCalled();
  });

  it("still registers the team, without its code, if the code was taken during checkout", async () => {
    verifyPaystackTransactionMock.mockResolvedValue(paystackResponse({ metadata: { mode: "team_fee", feeId: "fee-1" } }));
    teamFeePaymentFindFirst.mockResolvedValue({
      id: "payment-1",
      status: "PENDING",
      teamId: null,
      championshipId: "champ-1",
      pendingTeam: PENDING_TEAM,
      amountKes: 580,
    });
    txTeamFeePaymentUpdateMany.mockResolvedValue({ count: 1 });
    txTournamentTeamFindFirst.mockResolvedValue({ id: "someone-else" });
    txTournamentTeamCreate.mockResolvedValue({ id: "new-team" });

    await verifyAndRecordPayment("ref4");

    expect(txTournamentTeamCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ teamCode: null, notes: expect.stringContaining("THU") }),
    });
  });

  it("does not activate a subscription when Paystack charged a different amount", async () => {
    verifyPaystackTransactionMock.mockResolvedValue(
      paystackResponse({ amount: 100, metadata: { mode: "subscription", tenantId: "tenant-1", planId: "plan-1" } }),
    );
    paymentTransactionFindUnique.mockResolvedValue({ id: "txn-1", tenantId: "tenant-1", planId: "plan-1", status: "PENDING", amountKes: 580 });

    const result = await verifyAndRecordPayment("ref1");

    expect(result.success).toBe(false);
    expect(paymentTransactionUpdate).not.toHaveBeenCalled();
    expect(championshipSubscriptionCreate).not.toHaveBeenCalled();
  });

  it("does not mark a team fee PAID when Paystack charged in another currency", async () => {
    verifyPaystackTransactionMock.mockResolvedValue(
      paystackResponse({ currency: "NGN", metadata: { mode: "team_fee", teamId: "team-1", feeId: "fee-1" } }),
    );
    teamFeePaymentFindFirst.mockResolvedValue({ id: "payment-1", status: "PENDING", teamId: "team-1", pendingTeam: null, amountKes: 580 });

    const result = await verifyAndRecordPayment("ref3");

    expect(result.success).toBe(false);
    expect(txTeamFeePaymentUpdateMany).not.toHaveBeenCalled();
  });

  it("reports failure when metadata.mode is missing or unrecognized", async () => {
    verifyPaystackTransactionMock.mockResolvedValue(paystackResponse({ metadata: {} }));

    const result = await verifyAndRecordPayment("ref4");

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Unknown or missing payment mode/);
  });

  it("does not mark a transaction PAID or activate a subscription when Paystack reports the transaction as abandoned", async () => {
    verifyPaystackTransactionMock.mockResolvedValue(
      paystackResponse({ status: "abandoned", gateway_response: "Abandoned", metadata: { mode: "subscription", tenantId: "tenant-1", planId: "plan-1" } }),
    );

    const result = await verifyAndRecordPayment("ref-abandoned");

    expect(result.success).toBe(false);
    expect(paymentTransactionUpdate).not.toHaveBeenCalled();
    expect(championshipSubscriptionCreate).not.toHaveBeenCalled();
    expect(championshipSubscriptionUpdate).not.toHaveBeenCalled();
    expect(paymentTransactionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
  });

  it("propagates an error and activates nothing when Paystack has no record of the reference", async () => {
    verifyPaystackTransactionMock.mockRejectedValue(new Error("Failed to verify Paystack transaction"));

    await expect(verifyAndRecordPayment("ref-unknown-to-paystack")).rejects.toThrow(
      "Failed to verify Paystack transaction",
    );

    expect(paymentTransactionUpdate).not.toHaveBeenCalled();
    expect(championshipSubscriptionCreate).not.toHaveBeenCalled();
    expect(championshipSubscriptionUpdate).not.toHaveBeenCalled();
  });

  it("reports failure when the subscription transaction record cannot be found", async () => {
    verifyPaystackTransactionMock.mockResolvedValue(
      paystackResponse({ metadata: { mode: "subscription", tenantId: "tenant-1", planId: "plan-1" } }),
    );
    paymentTransactionFindUnique.mockResolvedValue(null);

    const result = await verifyAndRecordPayment("ref5");

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not found/);
  });
});
