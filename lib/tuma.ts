import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TUMA (api.tuma.co.ke) sends an M-Pesa PIN prompt to the payer's phone and
 * notifies a callback URL when the payment completes. Used for Zaroda
 * subscriptions. Needs TUMA_EMAIL and TUMA_API_KEY in the server settings.
 */
const TUMA_API = "https://api.tuma.co.ke";

interface TumaEnvelope<T> {
  success?: boolean;
  message?: string;
  data?: T;
}

async function tumaPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  const response = await fetch(`${TUMA_API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as TumaEnvelope<T>;
  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.message || `TUMA request failed (${response.status})`);
  }
  return result.data;
}

export interface StkPushResult {
  payment_id?: string;
  merchant_request_id?: string;
  checkout_request_id?: string;
}

/** What TUMA posts to the callback URL. */
export interface TumaNotification {
  status?: string;
  checkout_request_id?: string;
  amount?: number | string;
  mpesa_receipt_number?: string;
  message?: string;
}

/** True once TUMA_EMAIL and TUMA_API_KEY are set. */
export function tumaConfigured(): boolean {
  return !!process.env.TUMA_EMAIL?.trim() && !!process.env.TUMA_API_KEY?.trim();
}

/** Sends the M-Pesa PIN prompt to `phone` (2547XXXXXXXX). */
export async function tumaStkPush(input: { amount: number; phone: string; description: string; callbackUrl: string }): Promise<StkPushResult> {
  const { token } = await tumaPost<{ token: string }>("/auth/token", {
    email: process.env.TUMA_EMAIL?.trim(),
    api_key: process.env.TUMA_API_KEY?.trim(),
  });
  return tumaPost<StkPushResult>(
    "/payment/stk-push",
    { amount: input.amount, phone: input.phone, description: input.description, callback_url: input.callbackUrl },
    token,
  );
}

/** 0712345678 / 712345678 / +254712345678 / 254712345678 -> 254712345678 (Safaricom 07xx and 01xx). */
export function normaliseKenyanPhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-()+]/g, "");
  let local: string;
  if (/^254[17]\d{8}$/.test(digits)) local = digits.slice(3);
  else if (/^0[17]\d{8}$/.test(digits)) local = digits.slice(1);
  else if (/^[17]\d{8}$/.test(digits)) local = digits;
  else return null;
  return `254${local}`;
}

/** A one-off secret for a payment's notification address. */
export function randomSecret(): string {
  return randomBytes(32).toString("hex");
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Constant-time comparison of two hex strings. */
export function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
