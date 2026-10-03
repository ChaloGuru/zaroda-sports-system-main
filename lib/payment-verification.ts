import type { Gender, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { verifyPaystackTransaction, computeSubscriptionExpiry, kesToKobo } from "./paystack";

/**
 * Registration details for a publicly self-registered team, stored on its
 * TeamFeePayment until payment is confirmed and the team row is created.
 */
export interface PendingTeam {
  name: string;
  teamCode: string;
  gender: Gender;
  contactName: string | null;
  contactEmail: string;
  contactPhone: string | null;
}

export interface VerifyResult {
  success: boolean;
  mode?: string;
  message: string;
}

/**
 * True if Paystack actually charged what this payment record asked for. The
 * amount is set server-side at initialize, but Paystack recommends checking
 * it on verify too, so a charge for a different amount or currency is never
 * treated as payment for this record.
 */
function chargeMatches(data: { amount: number; currency: string }, amountKes: number): boolean {
  return data.amount === kesToKobo(amountKes) && data.currency === "KES";
}

const AMOUNT_MISMATCH = "The amount paid doesn't match this payment - contact support with your payment reference";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * The redirect from Paystack's hosted checkout only triggers this call - it
 * never proves payment succeeded on its own. This verify call against
 * Paystack's API is the sole source of truth for marking anything PAID.
 */
export async function verifyAndRecordPayment(reference: string): Promise<VerifyResult> {
  const paystackRes = await verifyPaystackTransaction(reference);
  const data = paystackRes.data;
  const mode = data.metadata?.mode;

  if (data.status !== "success") {
    if (mode === "subscription") {
      await prisma.paymentTransaction.updateMany({
        where: { paystackReference: reference },
        data: { status: "FAILED", paystackResponse: toJson(data) },
      });
    } else if (mode === "team_fee") {
      await prisma.teamFeePayment.updateMany({
        where: { paystackReference: reference },
        data: { status: "FAILED" },
      });
    }
    return { success: false, mode, message: data.gateway_response || "Payment was not successful" };
  }

  if (mode === "subscription") {
    const transaction = await prisma.paymentTransaction.findUnique({ where: { paystackReference: reference } });
    if (!transaction) return { success: false, mode, message: "Transaction record not found" };
    if (transaction.status === "PAID") {
      return { success: true, mode, message: "Payment already verified" };
    }
    if (!chargeMatches(data, transaction.amountKes)) {
      console.error(`[payments] ${reference}: charged ${data.amount} ${data.currency}, expected ${kesToKobo(transaction.amountKes)} KES`);
      return { success: false, mode, message: AMOUNT_MISMATCH };
    }

    await prisma.$transaction(async (tx) => {
      await tx.paymentTransaction.update({
        where: { id: transaction.id },
        data: { status: "PAID", paystackResponse: toJson(data) },
      });

      const plan = await tx.subscriptionPlan.findUniqueOrThrow({ where: { id: transaction.planId } });
      const now = new Date();
      const expiresAt = computeSubscriptionExpiry(now);
      const championshipId = (data.metadata.championshipId as string | undefined) ?? null;

      const existingSub = await tx.championshipSubscription.findFirst({
        where: { tenantId: transaction.tenantId, planId: plan.id, championshipId },
      });

      if (existingSub) {
        await tx.championshipSubscription.update({
          where: { id: existingSub.id },
          data: {
            status: "ACTIVE",
            paidAt: now,
            expiresAt,
            amountPaidKes: transaction.amountKes,
            paystackReference: transaction.paystackReference,
          },
        });
      } else {
        await tx.championshipSubscription.create({
          data: {
            tenantId: transaction.tenantId,
            planId: plan.id,
            championshipId,
            status: "ACTIVE",
            trialStartedAt: now,
            trialEndsAt: now,
            paidAt: now,
            expiresAt,
            amountPaidKes: transaction.amountKes,
            paystackReference: transaction.paystackReference,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          changedBy: null,
          operation: "UPDATE",
          tableName: "championship_subscriptions",
          recordId: transaction.tenantId,
          newData: toJson({ status: "ACTIVE", expiresAt, planId: plan.id }),
        },
      });
    });

    return { success: true, mode, message: "Subscription activated" };
  }

  if (mode === "team_fee") {
    const payment = await prisma.teamFeePayment.findFirst({ where: { paystackReference: reference } });
    if (!payment) return { success: false, mode, message: "Payment record not found" };
    if (!chargeMatches(data, payment.amountKes)) {
      console.error(`[payments] ${reference}: charged ${data.amount} ${data.currency}, expected ${kesToKobo(payment.amountKes)} KES`);
      return { success: false, mode, message: AMOUNT_MISMATCH };
    }

    await prisma.$transaction(async (tx) => {
      // Conditional update claims the payment: if the webhook and the
      // browser-redirect verify race, only one of them sees count === 1, so
      // a self-registered team is never created twice.
      const claimed = await tx.teamFeePayment.updateMany({
        where: { id: payment.id, status: { not: "PAID" } },
        data: { status: "PAID", paidAt: new Date() },
      });
      if (claimed.count === 0 || payment.teamId || !payment.pendingTeam) return;

      const pending = payment.pendingTeam as unknown as PendingTeam;
      // The code was free when checkout started, but another team may have
      // taken it while this one was paying - register without it rather
      // than fail a payment that has already gone through.
      const codeTaken = await tx.tournamentTeam.findFirst({
        where: { championshipId: payment.championshipId, teamCode: pending.teamCode },
        select: { id: true },
      });
      const team = await tx.tournamentTeam.create({
        data: {
          championshipId: payment.championshipId,
          name: pending.name,
          teamCode: codeTaken ? null : pending.teamCode,
          gender: pending.gender,
          contactName: pending.contactName,
          contactEmail: pending.contactEmail,
          contactPhone: pending.contactPhone,
          notes: codeTaken ? `Requested team code "${pending.teamCode}" was taken before payment completed.` : null,
        },
      });
      await tx.teamFeePayment.update({ where: { id: payment.id }, data: { teamId: team.id } });
    });
    return { success: true, mode, message: "Team fee payment verified" };
  }

  return { success: false, message: "Unknown or missing payment mode in transaction metadata" };
}
