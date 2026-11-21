import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

const findUnique = vi.fn();
const updateMany = vi.fn();
const completeTeamFeePayment = vi.fn();

vi.mock("@/lib/payment-verification", () => ({
  activateSubscription: vi.fn(),
  completeTeamFeePayment: (...a: unknown[]) => completeTeamFeePayment(...a),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    teamFeePayment: { findUnique: (...a: unknown[]) => findUnique(...a), updateMany: (...a: unknown[]) => updateMany(...a) },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({}),
  },
}));

const { POST: callback } = await import("@/app/api/payments/tuma-callback/route");

const FEE = "22222222-2222-2222-2222-222222222222";
const KEY = "b".repeat(64);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const payment = (over: Record<string, unknown> = {}) => ({
  id: FEE,
  status: "PENDING",
  amountKes: 1500,
  checkoutRequestId: "ws_CO_1",
  callbackSecretHash: sha(KEY),
  teamId: null,
  pendingTeam: { name: "Thunder FC" },
  championshipId: "champ-1",
  ...over,
});
const notify = (body: Record<string, unknown>, key = KEY) =>
  callback(new Request(`http://localhost/api/payments/tuma-callback?fee=${FEE}&key=${key}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("TUMA notification for a team fee", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue(payment());
  });

  it("registers the team when the right payment completes", async () => {
    const res = await notify({ status: "completed", checkout_request_id: "ws_CO_1", amount: 1500, mpesa_receipt_number: "QAB12CD" });
    expect(res.status).toBe(200);
    expect(completeTeamFeePayment).toHaveBeenCalledWith({}, expect.objectContaining({ id: FEE }), expect.objectContaining({ mpesaReceipt: "QAB12CD" }));
  });

  it("ignores a notification without this payment's secret", async () => {
    const res = await notify({ status: "completed", checkout_request_id: "ws_CO_1", amount: 1500 }, "c".repeat(64));
    expect(res.status).toBe(404);
    expect(completeTeamFeePayment).not.toHaveBeenCalled();
  });

  it("ignores a notification for another checkout", async () => {
    const res = await notify({ status: "completed", checkout_request_id: "ws_CO_other", amount: 1500 });
    expect(res.status).toBe(400);
    expect(completeTeamFeePayment).not.toHaveBeenCalled();
  });

  it("does not register a team when the amount is wrong", async () => {
    await notify({ status: "completed", checkout_request_id: "ws_CO_1", amount: 1 });
    expect(completeTeamFeePayment).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith({ where: { id: FEE, status: "PENDING" }, data: expect.objectContaining({ status: "FAILED" }) });
  });

  it("records a cancelled prompt as failed", async () => {
    await notify({ status: "cancelled", checkout_request_id: "ws_CO_1" });
    expect(updateMany).toHaveBeenCalledWith({ where: { id: FEE, status: "PENDING" }, data: { status: "FAILED", message: "Cancelled on the phone" } });
  });

  it("acknowledges a repeat of an already settled payment without changing it", async () => {
    findUnique.mockResolvedValue(payment({ status: "PAID" }));
    const res = await notify({ status: "completed", checkout_request_id: "ws_CO_1", amount: 1500 });
    expect(res.status).toBe(200);
    expect(completeTeamFeePayment).not.toHaveBeenCalled();
  });
});
