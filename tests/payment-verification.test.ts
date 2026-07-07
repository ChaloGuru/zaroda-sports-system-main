import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyPaystackTransactionMock = vi.fn();

vi.mock("@/lib/paystack", () => ({
  verifyPaystackTransaction: (...args: unknown[]) => verifyPaystackTransactionMock(...args),
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

const txClient = {
  paymentTransaction: { update: paymentTransactionUpdate },
  subscriptionPlan: { findUniqueOrThrow: subscriptionPlanFindUniqueOrThrow },
  championshipSubscription: { findFirst: championshipSubscriptionFindFirst, update: championshipSubscriptionUpdate, create: championshipSubscriptionCreate },
  auditLog: { create: auditLogCreate },
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

  it("marks a team fee payment PAID on success", async () => {
    verifyPaystackTransactionMock.mockResolvedValue(
      paystackResponse({ metadata: { mode: "team_fee", teamId: "team-1", feeId: "fee-1" } }),
    );
    teamFeePaymentFindFirst.mockResolvedValue({ id: "payment-1", status: "PENDING" });

    const result = await verifyAndRecordPayment("ref3");

    expect(result.success).toBe(true);
    expect(teamFeePaymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "payment-1" }, data: expect.objectContaining({ status: "PAID" }) }),
    );
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
