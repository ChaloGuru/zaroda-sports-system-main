import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activateSubscription, completeTeamFeePayment } from "@/lib/payment-verification";
import { sameHex, sha256, type TumaNotification } from "@/lib/tuma";

export const dynamic = "force-dynamic";

const received = () => NextResponse.json({ success: true, message: "Callback received" });
const unknown = () => NextResponse.json({ success: false, message: "Unknown payment" }, { status: 404 });
const UUID = /^[0-9a-f-]{36}$/i;
const KEY = /^[0-9a-f]{64}$/i;

/**
 * TUMA's notification for a payment: a subscription (?payment=<id>&key=<secret>) or a team's registration fee
 * (?fee=<id>&key=<secret>).
 *
 * TUMA doesn't sign its notifications and has no way to look a payment up, so one only counts if (1) it carries
 * this payment's secret key, which only our server and TUMA ever saw, (2) its checkout request id is the one TUMA
 * gave us when the prompt was sent, and (3) the amount matches. Then the payment is recorded and the subscription
 * activated, or the team registered.
 */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get("key") ?? "";
    const feeId = url.searchParams.get("fee");
    if (!KEY.test(key)) return unknown();
    const note = (await request.json().catch(() => ({}))) as TumaNotification;
    const status = (note.status ?? "").toLowerCase();
    const response = JSON.parse(JSON.stringify(note));
    const receipt = (note.mpesa_receipt_number ?? "").slice(0, 40) || null;
    const failMessage = note.message ?? (status === "cancelled" ? "Cancelled on the phone" : "Payment failed");

    // ── A team's registration fee ──────────────────────────────────────────
    if (feeId !== null) {
      if (!UUID.test(feeId)) return unknown();
      const payment = await prisma.teamFeePayment.findUnique({ where: { id: feeId } });
      if (!payment?.callbackSecretHash || !sameHex(sha256(key), payment.callbackSecretHash)) return unknown();
      if (payment.status !== "PENDING") return received();
      if (!payment.checkoutRequestId || note.checkout_request_id !== payment.checkoutRequestId) {
        console.error(`[tuma-callback] fee ${feeId}: checkout id mismatch`);
        return NextResponse.json({ success: false, message: "Checkout request does not match" }, { status: 400 });
      }
      if (status === "completed") {
        if (Number(note.amount) !== payment.amountKes) {
          console.error(`[tuma-callback] fee ${feeId}: amount ${note.amount} != ${payment.amountKes}`);
          await prisma.teamFeePayment.updateMany({
            where: { id: payment.id, status: "PENDING" },
            data: { status: "FAILED", message: `Amount mismatch: paid ${note.amount}` },
          });
          return received();
        }
        await prisma.$transaction((tx) => completeTeamFeePayment(tx, payment, { mpesaReceipt: receipt, message: note.message ?? null }));
      } else if (status === "failed" || status === "cancelled") {
        await prisma.teamFeePayment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "FAILED", message: failMessage } });
      }
      return received();
    }

    // ── A subscription ─────────────────────────────────────────────────────
    const paymentId = url.searchParams.get("payment") ?? "";
    if (!UUID.test(paymentId)) return unknown();
    const transaction = await prisma.paymentTransaction.findUnique({ where: { id: paymentId } });
    if (!transaction?.callbackSecretHash || !sameHex(sha256(key), transaction.callbackSecretHash)) return unknown();
    // Already settled (TUMA may retry) - acknowledge without changing anything.
    if (transaction.status !== "PENDING") return received();

    if (!transaction.checkoutRequestId || note.checkout_request_id !== transaction.checkoutRequestId) {
      console.error(`[tuma-callback] ${paymentId}: checkout id mismatch`);
      return NextResponse.json({ success: false, message: "Checkout request does not match" }, { status: 400 });
    }

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
          data: { status: "PAID", mpesaReceipt: receipt, message: note.message ?? null, completedAt: new Date(), paystackResponse: response },
        });
        if (claimed.count === 1) await activateSubscription(tx, transaction, transaction.championshipId);
      });
    } else if (status === "failed" || status === "cancelled") {
      await prisma.paymentTransaction.updateMany({
        where: { id: transaction.id, status: "PENDING" },
        data: { status: "FAILED", message: failMessage, paystackResponse: response },
      });
    }
    return received();
  } catch (error) {
    console.error("[tuma-callback] failed:", error);
    return NextResponse.json({ success: false, message: "Error" }, { status: 500 });
  }
}
