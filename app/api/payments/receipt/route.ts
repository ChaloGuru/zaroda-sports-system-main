import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface ReceiptData {
  reference: string;
  status: string;
  amountKes: number;
  paidAt: string | null;
  payerName: string;
  description: string;
}

/**
 * Looks up a paid transaction by its Paystack reference so the client can
 * render a receipt PDF. The reference itself is the bearer token here, same
 * trust model as /api/payments/verify - it's an unguessable value only the
 * payer's browser or Paystack ever sees.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference");
  if (!reference) return NextResponse.json({ error: "reference is required" }, { status: 400 });

  const subscription = await prisma.paymentTransaction.findUnique({
    where: { paystackReference: reference },
    include: { tenant: true, plan: true },
  });

  if (subscription) {
    if (subscription.status !== "PAID") {
      return NextResponse.json({ error: "Payment has not been verified yet" }, { status: 400 });
    }
    const data: ReceiptData = {
      reference: subscription.paystackReference,
      status: subscription.status,
      amountKes: subscription.amountKes,
      paidAt: subscription.updatedAt.toISOString(),
      payerName: subscription.tenant.organizationName,
      description: `${subscription.plan.displayName} subscription`,
    };
    return NextResponse.json(data);
  }

  const teamFeePayment = await prisma.teamFeePayment.findFirst({
    where: { paystackReference: reference },
    include: { team: true, fee: true },
  });

  if (teamFeePayment) {
    if (teamFeePayment.status !== "PAID") {
      return NextResponse.json({ error: "Payment has not been verified yet" }, { status: 400 });
    }
    const data: ReceiptData = {
      reference: teamFeePayment.paystackReference ?? reference,
      status: teamFeePayment.status,
      amountKes: teamFeePayment.amountKes,
      paidAt: (teamFeePayment.paidAt ?? teamFeePayment.updatedAt).toISOString(),
      payerName: teamFeePayment.team.name,
      description: teamFeePayment.fee.name,
    };
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "Payment record not found" }, { status: 404 });
}
