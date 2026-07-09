import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { verifyPaystackTransaction, computeSubscriptionExpiry } from "./paystack";

export interface VerifyResult {
  success: boolean;
  mode?: string;
  message: string;
}

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

    if (payment.status !== "PAID") {
      await prisma.teamFeePayment.update({
        where: { id: payment.id },
        data: { status: "PAID", paidAt: new Date() },
      });
    }
    return { success: true, mode, message: "Team fee payment verified" };
  }

  return { success: false, message: "Unknown or missing payment mode in transaction metadata" };
}
