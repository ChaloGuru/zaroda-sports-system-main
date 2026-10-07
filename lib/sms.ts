// SMS through Africa's Talking (africastalking.com). Configured by:
//   AT_USERNAME  - the Africa's Talking app username ("sandbox" for testing)
//   AT_API_KEY   - that app's API key
//   AT_SENDER_ID - optional registered sender name, e.g. ZARODA (otherwise
//                  Africa's Talking's shared short code is used)
// When the username or key is missing, sending is skipped and reported,
// never thrown, so a message still goes out by the other channels.

export interface SmsResult {
  /** The number as sent (+2547XXXXXXXX). */
  number: string;
  sent: boolean;
  error?: string;
  messageId?: string;
}

/** Africa's Talking status codes that mean the message was accepted. */
const ACCEPTED = new Set([100, 101, 102]);

export function isSmsConfigured(): boolean {
  return !!process.env.AT_USERNAME?.trim() && !!process.env.AT_API_KEY?.trim();
}

/** 07XX/01XX, 7XX, 254XXX or +254XXX -> +254XXXXXXXXX, or null if it isn't a Kenyan mobile number. */
export function toInternationalKenyan(raw: string): string | null {
  const digits = raw.replace(/[\s\-()+]/g, "");
  let local: string;
  if (/^254[17]\d{8}$/.test(digits)) local = digits.slice(3);
  else if (/^0[17]\d{8}$/.test(digits)) local = digits.slice(1);
  else if (/^[17]\d{8}$/.test(digits)) local = digits;
  else return null;
  return `+254${local}`;
}

interface AtRecipient {
  number?: string;
  status?: string;
  statusCode?: number;
  messageId?: string;
}

/** Sends one message to many numbers in a single request. */
export async function sendSms(numbers: string[], message: string): Promise<SmsResult[]> {
  if (numbers.length === 0) return [];
  if (!isSmsConfigured()) {
    return numbers.map((number) => ({ number, sent: false, error: "SMS isn't set up yet (AT_USERNAME / AT_API_KEY)" }));
  }
  const username = process.env.AT_USERNAME!.trim();
  const host = username === "sandbox" ? "https://api.sandbox.africastalking.com" : "https://api.africastalking.com";
  const body = new URLSearchParams({ username, to: numbers.join(","), message });
  if (process.env.AT_SENDER_ID?.trim()) body.set("from", process.env.AT_SENDER_ID.trim());

  try {
    const response = await fetch(`${host}/version1/messaging`, {
      method: "POST",
      headers: { apiKey: process.env.AT_API_KEY!.trim(), Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await response.text();
    let recipients: AtRecipient[] = [];
    try {
      recipients = (JSON.parse(text) as { SMSMessageData?: { Recipients?: AtRecipient[] } }).SMSMessageData?.Recipients ?? [];
    } catch {
      // Not JSON - an error page or message; reported below.
    }
    if (!response.ok || recipients.length === 0) {
      const reason = `Africa's Talking refused the request (${response.status}${text ? `: ${text.slice(0, 120)}` : ""})`;
      console.error("[sms]", reason);
      return numbers.map((number) => ({ number, sent: false, error: reason }));
    }
    const byNumber = new Map(recipients.map((r) => [r.number, r]));
    return numbers.map((number) => {
      const r = byNumber.get(number);
      if (!r) return { number, sent: false, error: "No result for this number" };
      const ok = ACCEPTED.has(Number(r.statusCode));
      return { number, sent: ok, messageId: r.messageId, ...(ok ? {} : { error: r.status || `Status ${r.statusCode}` }) };
    });
  } catch (error) {
    console.error("[sms] Africa's Talking couldn't be reached:", error);
    return numbers.map((number) => ({ number, sent: false, error: "The SMS service couldn't be reached" }));
  }
}

/** Three SMS segments - longer texts are cut so a message never costs more. */
export const SMS_MAX = 459;
const SMS_SIGN_OFF = " - Zaroda Sports";

/** The SMS version: the short text if given, otherwise the subject and message, cut to three segments. */
export function smsTextFor(input: { subject: string; body: string; smsText?: string }): string {
  const text = (input.smsText || `${input.subject}: ${input.body}`).replace(/\s+/g, " ").trim();
  const room = SMS_MAX - SMS_SIGN_OFF.length;
  return (text.length > room ? `${text.slice(0, room - 3).trimEnd()}...` : text) + SMS_SIGN_OFF;
}

