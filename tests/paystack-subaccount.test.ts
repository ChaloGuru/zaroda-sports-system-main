import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listPaystackBanks, createPaystackSubaccount, initializePaystackTransaction } from "@/lib/paystack";

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

describe("listPaystackBanks", () => {
  it("fetches the live Kenyan bank list from Paystack rather than a hardcoded set", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        message: "Banks retrieved",
        data: [{ name: "Equity Bank Kenya Limited", code: "068", slug: "equity-bank-kenya" }],
      }),
    }) as unknown as typeof fetch;

    const banks = await listPaystackBanks();

    expect(banks).toEqual([{ name: "Equity Bank Kenya Limited", code: "068", slug: "equity-bank-kenya" }]);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/bank?country=kenya"),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("throws when Paystack reports an error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ status: false, message: "Unable to fetch banks" }),
    }) as unknown as typeof fetch;

    await expect(listPaystackBanks()).rejects.toThrow(/Unable to fetch banks/);
  });
});

describe("createPaystackSubaccount", () => {
  it("sends percentage_charge: 0 so the subaccount receives 100% of every transaction routed to it", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        message: "Subaccount created",
        data: {
          subaccount_code: "ACCT_123",
          account_number: "1234567890",
          account_name: "Jane's School",
          settlement_bank: "068",
          percentage_charge: 0,
        },
      }),
    }) as unknown as typeof fetch;

    const result = await createPaystackSubaccount({
      businessName: "Jane's School",
      settlementBankCode: "068",
      accountNumber: "1234567890",
    });

    expect(result.data.subaccount_code).toBe("ACCT_123");
    expect(result.data.account_name).toBe("Jane's School");

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody).toEqual({
      business_name: "Jane's School",
      settlement_bank: "068",
      account_number: "1234567890",
      percentage_charge: 0,
    });
  });

  it("throws (surfacing Paystack's error) on an invalid account or unsupported bank, without swallowing it", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: false, message: "Invalid account number" }),
    }) as unknown as typeof fetch;

    await expect(
      createPaystackSubaccount({ businessName: "Jane's School", settlementBankCode: "068", accountNumber: "bad" }),
    ).rejects.toThrow(/Invalid account number/);
  });
});

describe("initializePaystackTransaction with a subaccount", () => {
  it("includes the subaccount code in the request body when provided (team_fee routing)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        message: "ok",
        data: { authorization_url: "https://paystack.com/pay/abc", access_code: "abc", reference: "ref1" },
      }),
    }) as unknown as typeof fetch;

    await initializePaystackTransaction({
      email: "a@b.com",
      amountKobo: 5000,
      reference: "ref1",
      metadata: { mode: "team_fee", teamId: "t1", feeId: "f1" },
      callbackUrl: "http://localhost/payment-success",
      subaccount: "ACCT_123",
    });

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.subaccount).toBe("ACCT_123");
    expect(sentBody.bearer).toBeUndefined();
  });

  it("omits the subaccount field entirely when not provided (subscription flow, unchanged)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        message: "ok",
        data: { authorization_url: "https://paystack.com/pay/abc", access_code: "abc", reference: "ref1" },
      }),
    }) as unknown as typeof fetch;

    await initializePaystackTransaction({
      email: "a@b.com",
      amountKobo: 58_000,
      reference: "ref1",
      metadata: { mode: "subscription", tenantId: "t1" },
      callbackUrl: "http://localhost/payment-success",
    });

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.subaccount).toBeUndefined();
  });
});
