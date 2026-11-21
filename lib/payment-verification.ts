import type { Gender, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

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

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Turns a paid subscription payment into an active subscription (from TUMA's
 * notification). A subscription pays
 * for one championship at its level and doesn't expire: paid from inside a
 * championship it belongs to that one; otherwise it waits, unused, for the
 * next championship the tenant creates at that level.
 */
export async function activateSubscription(
  tx: Prisma.TransactionClient,
  transaction: { tenantId: string; planId: string; amountKes: number; paystackReference: string },
  championshipId: string | null,
): Promise<void> {
  const plan = await tx.subscriptionPlan.findUniqueOrThrow({ where: { id: transaction.planId } });
  const now = new Date();
  const paid = {
    status: "ACTIVE" as const,
    paidAt: now,
    expiresAt: null,
    amountPaidKes: transaction.amountKes,
    paystackReference: transaction.paystackReference,
  };

  // Each payment is its own subscription, unless it pays for a championship
  // that already has one (e.g. an expired or cancelled one being restored).
  const existingSub = championshipId
    ? await tx.championshipSubscription.findFirst({ where: { tenantId: transaction.tenantId, planId: plan.id, championshipId } })
    : null;
  if (existingSub) {
    await tx.championshipSubscription.update({ where: { id: existingSub.id }, data: paid });
  } else {
    await tx.championshipSubscription.create({
      data: { tenantId: transaction.tenantId, planId: plan.id, championshipId, trialStartedAt: now, trialEndsAt: now, ...paid },
    });
  }

  await tx.auditLog.create({
    data: {
      changedBy: null,
      operation: "UPDATE",
      tableName: "championship_subscriptions",
      recordId: transaction.tenantId,
      newData: toJson({ status: "ACTIVE", planId: plan.id, championshipId }),
    },
  });
}

/**
 * Marks a team fee payment PAID and, for a public self-registration, creates the team from its stored details.
 * The conditional update claims the payment, so a repeated notification never creates the team twice.
 * Returns false if it was already settled.
 */
export async function completeTeamFeePayment(
  tx: Prisma.TransactionClient,
  payment: { id: string; teamId: string | null; pendingTeam: Prisma.JsonValue | null; championshipId: string },
  paid: { mpesaReceipt?: string | null; message?: string | null } = {},
): Promise<boolean> {
  const claimed = await tx.teamFeePayment.updateMany({
    where: { id: payment.id, status: { not: "PAID" } },
    data: { status: "PAID", paidAt: new Date(), mpesaReceipt: paid.mpesaReceipt ?? null, message: paid.message ?? null },
  });
  if (claimed.count === 0) return false;
  if (payment.teamId || !payment.pendingTeam) return true;

  const pending = payment.pendingTeam as unknown as PendingTeam;
  // The code was free when the prompt was sent, but another team may have taken it while this one was paying -
  // register without it rather than fail a payment that has already gone through.
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
  return true;
}
