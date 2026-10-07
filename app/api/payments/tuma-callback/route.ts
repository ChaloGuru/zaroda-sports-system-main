import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activateSubscription } from "@/lib/payment-verification";
import { sameHex, sha256, type TumaNotification } from "@/lib/tuma";

export const dynamic = "force-dynamic";

const received = () => NextResponse.json({ success: true, message: "Callback received" });

/**
 * TUMA's notification for a subscription payment
 * (POST ?payment=<id>&key=<secret>).
 *
 * TUMA doesn't sign its notifications and has no way to look a payment up,
 * so one only counts if (1) it carries this payment's secret key, which only
 * our server and TUMA ever saw, (2) its checkout request id is the one TUMA
 * gave us when the prompt was sent, and (3) the amount matches the plan's
 * price. Then the payment is recorded and the subscription activated.
 */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const paymentId = url.searchParams.get("payment") ?? "";
    const key = url.searchParams.get("key") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(paymentId) || !/^[0-9a-f]{64}$/i.test(key)) {
      return NextResponse.json({ success: false, message: "Unknown payment" }, { status: 404 });
    }

    const transaction = await prisma.paymentTransaction.findUnique({ where: { id: paymentId } });
    if (!transaction?.callbackSecretHash || !sameHex(sha256(key), transaction.callbackSecretHash)) {
      return NextResponse.json({ success: false, message: "Unknown payment" }, { status: 404 });
    }

    const note = (await request.json().catch(() => ({}))) as TumaNotification;
    // Already settled (TUMA may retry) - acknowledge without changing anything.
    if (transaction.status !== "PENDING") return received();

    if (!transaction.checkoutRequestId || note.checkout_request_id !== transaction.checkoutRequestId) {
      console.error(`[tuma-callback] ${paymentId}: checkout id mismatch`);
      return NextResponse.json({ success: false, message: "Checkout request does not match" }, { status: 400 });
    }

    const status = (note.status ?? "").toLowerCase();
    const response = JSON.parse(JSON.stringify(note));
    if (status === "completed") {
      if (Number(note.amount) !== transaction.amountKes) {
        console.error(`[tuma-callback] ${paymentId}: amount ${note.amount} != ${transaction.amountKes}`);
        await prisma.paymentTransaction.update({
          where: { id: transaction.id },
          data: { status: "FAILED", message: `Amount mismatch: paid ${note.amount}`, paystackResponse: response },
        });
        return received();
      }
      await prisma.$transaction(async (tx) => {
        // Only the first notification for a pending payment counts.
        const claimed = await tx.paymentTransaction.updateMany({
          where: { id: transaction.id, status: "PENDING" },
          data: {
            status: "PAID",
            mpesaReceipt: (note.mpesa_receipt_number ?? "").slice(0, 40) || null,
            message: note.message ?? null,
            completedAt: new Date(),
            paystackResponse: response,
          },
        });
        if (claimed.count === 1) await activateSubscription(tx, transaction, transaction.championshipId);
      });
    } else if (status === "failed" || status === "cancelled") {
      await prisma.paymentTransaction.updateMany({
        where: { id: transaction.id, status: "PENDING" },
        data: { status: "FAILED", message: note.message ?? (status === "cancelled" ? "Cancelled on the phone" : "Payment failed"), paystackResponse: response },
      });
    }
    return received();
  } catch (error) {
    console.error("[tuma-callback] failed:", error);
    return NextResponse.json({ success: false, message: "Error" }, { status: 500 });
  }
}
