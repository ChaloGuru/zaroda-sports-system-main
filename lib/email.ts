import { Resend } from "resend";

// Transactional email through Resend. Configured by:
//   RESEND_API_KEY - from resend.com/api-keys
//   EMAIL_FROM     - a sender on a domain verified in Resend,
//                    e.g. "Zaroda Sports <noreply@zarodasports.live>"
// When either is missing, sending is skipped and reported (never thrown),
// so the feature that wanted to email still works and can fall back to
// sharing a link another way.

export interface EmailResult {
  sent: boolean;
  /** Why it wasn't sent - safe to show to the administrator. */
  error?: string;
}

let client: Resend | null = null;

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

export async function sendEmail(message: { to: string; subject: string; html: string; text: string; replyTo?: string }): Promise<EmailResult> {
  if (!isEmailConfigured()) return { sent: false, error: "Email isn't set up yet (RESEND_API_KEY / EMAIL_FROM)" };
  client ??= new Resend(process.env.RESEND_API_KEY);
  try {
    const { error } = await client.emails.send({
      from: process.env.EMAIL_FROM!,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    });
    if (error) {
      console.error("Resend rejected an email:", error.name, error.message);
      return { sent: false, error: error.message };
    }
    return { sent: true };
  } catch (error) {
    console.error("Email sending failed:", error);
    return { sent: false, error: "The email service couldn't be reached" };
  }
}

/** Escapes text for safe inclusion in an HTML email. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export interface BatchEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Sends many emails in as few requests as possible (Resend takes up to 100
 * per batch). Returns a result per email, in order.
 */
export async function sendEmailBatch(messages: BatchEmail[]): Promise<EmailResult[]> {
  if (messages.length === 0) return [];
  if (!isEmailConfigured()) return messages.map(() => ({ sent: false, error: "Email isn't set up yet (RESEND_API_KEY / EMAIL_FROM)" }));
  client ??= new Resend(process.env.RESEND_API_KEY);
  const results: EmailResult[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const { error } = await client.batch.send(chunk.map((m) => ({ from: process.env.EMAIL_FROM!, ...m })));
      if (error) {
        console.error("Resend rejected an email batch:", error.name, error.message);
        results.push(...chunk.map(() => ({ sent: false, error: error.message })));
      } else {
        results.push(...chunk.map(() => ({ sent: true })));
      }
    } catch (error) {
      console.error("Email batch failed:", error);
      results.push(...chunk.map(() => ({ sent: false, error: "The email service couldn't be reached" })));
    }
  }
  return results;
}
