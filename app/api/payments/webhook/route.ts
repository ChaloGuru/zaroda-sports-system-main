import { NextResponse } from "next/server";
import { verifyPaystackWebhookSignature } from "@/lib/paystack";
import { verifyAndRecordPayment } from "@/lib/payment-verification";

export const dynamic = "force-dynamic";

/**
 * Reliable backstop for the browser-redirect verify flow in
 * app/api/payments/verify/route.ts - that route only fires if the customer's
 * browser makes it back to our callback URL, so this webhook is the source
 * of truth Paystack calls directly regardless of what happens client-side.
 *
 * The body must be read as raw text (not request.json()) because the
 * signature is computed over the exact raw bytes Paystack sent.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!verifyPaystackWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let reference: string | undefined;
  try {
    const payload = JSON.parse(rawBody) as { data?: { reference?: string } };
    reference = payload.data?.reference;
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  if (!reference) {
    return NextResponse.json({ error: "Missing data.reference" }, { status: 400 });
  }

  try {
    const result = await verifyAndRecordPayment(reference);
    // Always 200 once the signature checks out and the payload parses - even
    // a business-logic no-op (already verified, record not found) is a
    // successfully-handled event. Paystack retries on non-200, and retrying
    // an already-settled reference just wastes calls to their API.
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook processing failed" },
      { status: 500 },
    );
  }
}
