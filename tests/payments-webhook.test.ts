import { createHmac } from "crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const verifyAndRecordPaymentMock = vi.fn();

vi.mock("@/lib/payment-verification", () => ({
  verifyAndRecordPayment: (...args: unknown[]) => verifyAndRecordPaymentMock(...args),
}));

const { POST } = await import("@/app/api/payments/webhook/route");

const originalSecret = process.env.PAYSTACK_SECRET_KEY;
const SECRET = "sk_test_webhook_secret";

function sign(rawBody: string, secret = SECRET): string {
  return createHmac("sha512", secret).update(rawBody).digest("hex");
}

function webhookRequest(rawBody: string, signature: string | null): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature !== null) headers.set("x-paystack-signature", signature);
  return new Request("http://localhost/api/payments/webhook", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

describe("POST /api/payments/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PAYSTACK_SECRET_KEY = SECRET;
  });

  afterEach(() => {
    process.env.PAYSTACK_SECRET_KEY = originalSecret;
  });

  it("rejects a request with no x-paystack-signature header", async () => {
    const rawBody = JSON.stringify({ event: "charge.success", data: { reference: "ref1" } });

    const response = await POST(webhookRequest(rawBody, null));

    expect(response.status).toBe(401);
    expect(verifyAndRecordPaymentMock).not.toHaveBeenCalled();
  });

  it("rejects a request with an invalid x-paystack-signature", async () => {
    const rawBody = JSON.stringify({ event: "charge.success", data: { reference: "ref1" } });

    const response = await POST(webhookRequest(rawBody, "not-the-right-signature"));

    expect(response.status).toBe(401);
    expect(verifyAndRecordPaymentMock).not.toHaveBeenCalled();
  });

  it("accepts a request with a valid signature and calls verifyAndRecordPayment with the reference", async () => {
    verifyAndRecordPaymentMock.mockResolvedValue({ success: true, mode: "subscription", message: "Subscription activated" });
    const rawBody = JSON.stringify({ event: "charge.success", data: { reference: "ref-valid-1" } });

    const response = await POST(webhookRequest(rawBody, sign(rawBody)));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(verifyAndRecordPaymentMock).toHaveBeenCalledWith("ref-valid-1");
    expect(json.success).toBe(true);
  });

  it("returns 200 even when verifyAndRecordPayment reports a business-logic failure", async () => {
    verifyAndRecordPaymentMock.mockResolvedValue({ success: true, mode: "subscription", message: "Payment already verified" });
    const rawBody = JSON.stringify({ event: "charge.success", data: { reference: "ref-already-verified" } });

    const response = await POST(webhookRequest(rawBody, sign(rawBody)));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.message).toMatch(/already verified/);
  });

  it("returns 200 when verifyAndRecordPayment reports success: false due to a business condition", async () => {
    verifyAndRecordPaymentMock.mockResolvedValue({ success: false, message: "Transaction record not found" });
    const rawBody = JSON.stringify({ event: "charge.success", data: { reference: "ref-not-found" } });

    const response = await POST(webhookRequest(rawBody, sign(rawBody)));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(false);
  });

  it("returns a non-200 status when verifyAndRecordPayment throws a genuine processing error", async () => {
    verifyAndRecordPaymentMock.mockRejectedValue(new Error("Failed to verify Paystack transaction"));
    const rawBody = JSON.stringify({ event: "charge.success", data: { reference: "ref-error" } });

    const response = await POST(webhookRequest(rawBody, sign(rawBody)));

    expect(response.status).toBe(500);
  });

  it("returns 400 for a malformed (non-JSON) body even with a valid signature over that body", async () => {
    const rawBody = "not json";

    const response = await POST(webhookRequest(rawBody, sign(rawBody)));

    expect(response.status).toBe(400);
    expect(verifyAndRecordPaymentMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the payload is valid JSON but missing data.reference", async () => {
    const rawBody = JSON.stringify({ event: "charge.success", data: {} });

    const response = await POST(webhookRequest(rawBody, sign(rawBody)));

    expect(response.status).toBe(400);
    expect(verifyAndRecordPaymentMock).not.toHaveBeenCalled();
  });

  it("ignores a validly-signed event that is not charge.success, without verifying anything", async () => {
    const rawBody = JSON.stringify({ event: "charge.attempt", data: { reference: "ref-attempt" } });

    const response = await POST(webhookRequest(rawBody, sign(rawBody)));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ignored).toBe(true);
    expect(verifyAndRecordPaymentMock).not.toHaveBeenCalled();
  });
});
