import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";

const planFindUnique = vi.fn();
const txFindFirst = vi.fn();
const txFindUnique = vi.fn();
const txCreate = vi.fn();
const txUpdate = vi.fn();
const txUpdateMany = vi.fn();
const activateSubscription = vi.fn();

vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/authorize", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authorize")>("@/lib/authorize");
  return {
    ...actual,
    requireAuth: vi.fn().mockResolvedValue({ userId: "owner-1", tenantId: "tenant-1", roles: [{ role: "TENANT_OWNER", championshipId: null }] }),
  };
});
vi.mock("@/lib/payment-verification", () => ({ activateSubscription: (...a: unknown[]) => activateSubscription(...a) }));
const paymentTransaction = {
  findFirst: (...a: unknown[]) => txFindFirst(...a),
  findUnique: (...a: unknown[]) => txFindUnique(...a),
  create: (...a: unknown[]) => txCreate(...a),
  update: (...a: unknown[]) => txUpdate(...a),
  updateMany: (...a: unknown[]) => txUpdateMany(...a),
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscriptionPlan: { findUnique: (...a: unknown[]) => planFindUnique(...a) },
    paymentTransaction,
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({ paymentTransaction }),
  },
}));

const { POST: subscribe } = await import("@/app/api/payments/subscribe/route");
const { POST: callback } = await import("@/app/api/payments/tuma-callback/route");

const PLAN = "11111111-1111-1111-1111-111111111111";
const PAYMENT = "22222222-2222-2222-2222-222222222222";
const KEY = "a".repeat(64);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function subscribeReq(body: Record<string, unknown>) {
  return new Request("http://localhost/api/payments/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` },
    body: JSON.stringify({ planId: PLAN, phone: "0712 345 678", ...body }),
  });
}

function notify(body: Record<string, unknown>, key = KEY) {
  return new Request(`http://localhost/api/payments/tuma-callback?payment=${PAYMENT}&key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("paying for a subscription by M-Pesa", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TUMA_EMAIL = "pay@zaroda.test";
    process.env.TUMA_API_KEY = "key";
    planFindUnique.mockResolvedValue({ id: PLAN, isActive: true, priceKes: 2500, displayName: "Zone Essential" });
    txFindFirst.mockResolvedValue(null);
    txCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: PAYMENT, ...data }));
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () =>
        String(url).endsWith("/auth/token")
          ? { success: true, data: { token: "t" } }
          : { success: true, data: { checkout_request_id: "ws_CO_1" } },
    }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("records a pending TUMA payment and sends the PIN prompt with a secret notification address", async () => {
    const res = await subscribe(subscribeReq({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ paymentId: PAYMENT, amountKes: 2500, phone: "254712345678" });
    expect(txCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ provider: "TUMA", amountKes: 2500, phone: "254712345678" }) });
    const push = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(push).toMatchObject({ amount: 2500, phone: "254712345678" });
    const key = new URL(push.callback_url).searchParams.get("key")!;
    expect(push.callback_url).toMatch(new RegExp(`^https://www\\.zarodasports\\.live/api/payments/tuma-callback\\?payment=${PAYMENT}&key=`));
    // Only a hash of the key is stored.
    expect(txCreate.mock.calls[0]![0].data.callbackSecretHash).toBe(sha(key));
    expect(txUpdate).toHaveBeenCalledWith({ where: { id: PAYMENT }, data: { checkoutRequestId: "ws_CO_1" } });
  });

  it("refuses a number that isn't an M-Pesa number", async () => {
    const res = await subscribe(subscribeReq({ phone: "12345" }));
    expect(res.status).toBe(400);
  });

  it("says so when TUMA isn't set up yet", async () => {
    delete process.env.TUMA_API_KEY;
    const res = await subscribe(subscribeReq({}));
    expect(res.status).toBe(503);
    expect(txCreate).not.toHaveBeenCalled();
  });

  it("won't send a second prompt while one is waiting", async () => {
    txFindFirst.mockResolvedValue({ id: "earlier" });
    const res = await subscribe(subscribeReq({}));
    expect(res.status).toBe(429);
  });
});

describe("TUMA's payment notification", () => {
  const pending = {
    id: PAYMENT,
    tenantId: "tenant-1",
    planId: PLAN,
    amountKes: 2500,
    status: "PENDING",
    championshipId: null,
    paystackReference: "sub_1",
    callbackSecretHash: sha(KEY),
    checkoutRequestId: "ws_CO_1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    txFindUnique.mockResolvedValue(pending);
    txUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("activates the subscription when the payment completes", async () => {
    const res = await callback(notify({ status: "completed", checkout_request_id: "ws_CO_1", amount: 2500, mpesa_receipt_number: "QAB123" }));
    expect(res.status).toBe(200);
    expect(txUpdateMany).toHaveBeenCalledWith({
      where: { id: PAYMENT, status: "PENDING" },
      data: expect.objectContaining({ status: "PAID", mpesaReceipt: "QAB123" }),
    });
    expect(activateSubscription).toHaveBeenCalledWith(expect.anything(), pending, null);
  });

  it("ignores a notification without the payment's secret key", async () => {
    const res = await callback(notify({ status: "completed", checkout_request_id: "ws_CO_1", amount: 2500 }, "b".repeat(64)));
    expect(res.status).toBe(404);
    expect(activateSubscription).not.toHaveBeenCalled();
  });

  it("ignores a notification for a different checkout", async () => {
    const res = await callback(notify({ status: "completed", checkout_request_id: "ws_CO_other", amount: 2500 }));
    expect(res.status).toBe(400);
    expect(activateSubscription).not.toHaveBeenCalled();
  });

  it("marks a wrong amount as failed instead of activating", async () => {
    await callback(notify({ status: "completed", checkout_request_id: "ws_CO_1", amount: 1 }));
    expect(txUpdate).toHaveBeenCalledWith({ where: { id: PAYMENT }, data: expect.objectContaining({ status: "FAILED" }) });
    expect(activateSubscription).not.toHaveBeenCalled();
  });

  it("records a cancelled prompt as failed", async () => {
    await callback(notify({ status: "cancelled", checkout_request_id: "ws_CO_1" }));
    expect(txUpdateMany).toHaveBeenCalledWith({ where: { id: PAYMENT, status: "PENDING" }, data: expect.objectContaining({ status: "FAILED" }) });
  });

  it("acknowledges a repeat notification without changing anything", async () => {
    txFindUnique.mockResolvedValue({ ...pending, status: "PAID" });
    const res = await callback(notify({ status: "completed", checkout_request_id: "ws_CO_1", amount: 2500 }));
    expect(res.status).toBe(200);
    expect(txUpdateMany).not.toHaveBeenCalled();
    expect(activateSubscription).not.toHaveBeenCalled();
  });
});
