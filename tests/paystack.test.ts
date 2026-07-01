import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  initializePaystackTransaction,
  verifyPaystackTransaction,
  kesToKobo,
  generatePaymentReference,
  computeSubscriptionExpiry,
} from "@/lib/paystack";

const originalFetch = global.fetch;
const originalSecret = process.env.PAYSTACK_SECRET_KEY;

beforeEach(() => {
  process.env.PAYSTACK_SECRET_KEY = "sk_test_dummy";
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.PAYSTACK_SECRET_KEY = originalSecret;
  vi.restoreAllMocks();
});

describe("kesToKobo", () => {
  it("converts KES to the spec-mandated x100 amount", () => {
    expect(kesToKobo(580)).toBe(58_000);
    expect(kesToKobo(5800)).toBe(580_000);
  });

  it("rounds fractional KES safely", () => {
    expect(kesToKobo(10.005)).toBe(1001);
  });
});

describe("generatePaymentReference", () => {
  it("produces unique, prefixed references", () => {
    const a = generatePaymentReference("sub");
    const b = generatePaymentReference("sub");
    expect(a).not.toBe(b);
    expect(a.startsWith("sub_")).toBe(true);
  });
});

describe("computeSubscriptionExpiry", () => {
  it("expires exactly one year after the given date", () => {
    const from = new Date("2026-01-15T00:00:00.000Z");
    const expiry = computeSubscriptionExpiry(from);
    expect(expiry.getUTCFullYear()).toBe(2027);
    expect(expiry.getUTCMonth()).toBe(from.getUTCMonth());
    expect(expiry.getUTCDate()).toBe(from.getUTCDate());
  });
});

describe("initializePaystackTransaction", () => {
  it("throws when PAYSTACK_SECRET_KEY is not configured", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    await expect(
      initializePaystackTransaction({
        email: "a@b.com",
        amountKobo: 1000,
        reference: "ref1",
        metadata: { mode: "subscription" },
        callbackUrl: "http://localhost/payment-success",
      }),
    ).rejects.toThrow(/PAYSTACK_SECRET_KEY/);
  });

  it("returns the authorization URL on a successful response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        message: "Authorization URL created",
        data: { authorization_url: "https://paystack.com/pay/abc", access_code: "abc", reference: "ref1" },
      }),
    }) as unknown as typeof fetch;

    const result = await initializePaystackTransaction({
      email: "a@b.com",
      amountKobo: 58_000,
      reference: "ref1",
      metadata: { mode: "subscription", tenantId: "t1" },
      callbackUrl: "http://localhost/payment-success",
    });

    expect(result.data.authorization_url).toBe("https://paystack.com/pay/abc");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/transaction/initialize"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws when Paystack responds with status: false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: false, message: "Invalid amount", data: {} }),
    }) as unknown as typeof fetch;

    await expect(
      initializePaystackTransaction({
        email: "a@b.com",
        amountKobo: 0,
        reference: "ref2",
        metadata: { mode: "subscription" },
        callbackUrl: "http://localhost/payment-success",
      }),
    ).rejects.toThrow(/Invalid amount/);
  });
});

describe("verifyPaystackTransaction", () => {
  it("returns success data for a paid transaction", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        message: "Verification successful",
        data: {
          status: "success",
          reference: "ref1",
          amount: 58_000,
          currency: "KES",
          metadata: { mode: "subscription", tenantId: "t1", planId: "p1" },
          gateway_response: "Successful",
          paid_at: "2026-01-01T00:00:00.000Z",
        },
      }),
    }) as unknown as typeof fetch;

    const result = await verifyPaystackTransaction("ref1");
    expect(result.data.status).toBe("success");
    expect(result.data.metadata.mode).toBe("subscription");
  });

  it("reports a failed gateway transaction without throwing", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        message: "Verification successful",
        data: {
          status: "failed",
          reference: "ref2",
          amount: 58_000,
          currency: "KES",
          metadata: { mode: "team_fee", teamId: "team1", feeId: "fee1" },
          gateway_response: "Declined",
          paid_at: null,
        },
      }),
    }) as unknown as typeof fetch;

    const result = await verifyPaystackTransaction("ref2");
    expect(result.data.status).toBe("failed");
    expect(result.data.metadata.mode).toBe("team_fee");
  });

  it("throws when the HTTP call itself fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ status: false, message: "Transaction reference not found" }),
    }) as unknown as typeof fetch;

    await expect(verifyPaystackTransaction("unknown-ref")).rejects.toThrow(/reference not found/);
  });
});
