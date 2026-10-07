import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isSuperAdmin, hasRole, toErrorResponse, AuthorizationError } from "@/lib/authorize";
import { subscriptionPaySchema } from "@/lib/validations";
import { generatePaymentReference } from "@/lib/paystack";
import { normaliseKenyanPhone, randomSecret, sha256, tumaConfigured, tumaStkPush } from "@/lib/tuma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Where TUMA sends payment notifications. Fixed - never taken from the
 * request, so a forged Host header can't send a payment's secret
 * notification address elsewhere. The www host, because the bare domain
 * redirects and a redirected notification may not be followed.
 */
const CALLBACK_BASE = (process.env.TUMA_CALLBACK_BASE_URL || "https://www.zarodasports.live").replace(/\/$/, "");

/**
 * Starts paying for a subscription by M-Pesa: records a pending payment with
 * a secret notification address and asks TUMA to send the PIN prompt to the
 * given phone. The subscription activates when TUMA's notification arrives
 * (./tuma-callback); the page polls GET for the outcome.
 */
export async function POST(request: Request) {
  try {
    const limit = await rateLimit(`payments:subscribe:${getClientIp(request)}`, 10, 60_000);
    if (!limit.allowed) return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

    const input = subscriptionPaySchema.parse(await request.json());
    const ctx = await requireAuth();
    if (!hasRole(ctx, "TENANT_OWNER") && !isSuperAdmin(ctx)) throw new AuthorizationError("Only a tenant owner can purchase a subscription");
    if (!ctx.tenantId) throw new AuthorizationError("No tenant is associated with this account");

    const phone = normaliseKenyanPhone(input.phone);
    if (!phone) return NextResponse.json({ error: "Enter an M-Pesa number, e.g. 0712 345 678" }, { status: 400 });
    if (!tumaConfigured()) {
      return NextResponse.json({ error: "M-Pesa payment isn't available yet - contact Zaroda on 0781230805 to subscribe" }, { status: 503 });
    }

    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: input.planId } });
    if (!plan || !plan.isActive) throw new Error("Selected plan is not available");

    // Don't send a second prompt while one is still waiting.
    const waiting = await prisma.paymentTransaction.findFirst({
      where: { tenantId: ctx.tenantId, provider: "TUMA", status: "PENDING", createdAt: { gte: new Date(Date.now() - 2 * 60_000) } },
      select: { id: true },
    });
    if (waiting) {
      return NextResponse.json({ error: "A payment prompt was sent in the last 2 minutes - check your phone, or try again shortly" }, { status: 429 });
    }

    const secret = randomSecret();
    const transaction = await prisma.paymentTransaction.create({
      data: {
        tenantId: ctx.tenantId,
        planId: plan.id,
        championshipId: input.championshipId ?? null,
        paystackReference: generatePaymentReference("sub"),
        amountKes: plan.priceKes,
        provider: "TUMA",
        phone,
        callbackSecretHash: sha256(secret),
      },
    });

    try {
      const push = await tumaStkPush({
        amount: plan.priceKes,
        phone,
        description: `Zaroda Sports: ${plan.displayName}`.slice(0, 100),
        callbackUrl: `${CALLBACK_BASE}/api/payments/tuma-callback?payment=${transaction.id}&key=${secret}`,
      });
      await prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: { checkoutRequestId: push.checkout_request_id ?? null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "TUMA didn't accept the request";
      await prisma.paymentTransaction.update({ where: { id: transaction.id }, data: { status: "FAILED", message } });
      return NextResponse.json({ error: `Couldn't send the M-Pesa prompt: ${message}` }, { status: 502 });
    }

    return NextResponse.json({ paymentId: transaction.id, amountKes: plan.priceKes, phone });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/** The outcome of one of the caller's subscription payments, for the page waiting on it. */
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const ctx = await requireAuth();
    const transaction = await prisma.paymentTransaction.findUnique({
      where: { id },
      select: { tenantId: true, status: true, message: true, mpesaReceipt: true, paystackReference: true },
    });
    if (!transaction || (transaction.tenantId !== ctx.tenantId && !isSuperAdmin(ctx))) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
    return NextResponse.json({
      status: transaction.status,
      message: transaction.message,
      mpesaReceipt: transaction.mpesaReceipt,
      reference: transaction.paystackReference,
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
