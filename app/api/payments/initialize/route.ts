import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, isSuperAdmin, hasRole, toErrorResponse, AuthorizationError } from "@/lib/authorize";
import { paymentInitializeSchema } from "@/lib/validations";
import { initializePaystackTransaction, kesToKobo, generatePaymentReference } from "@/lib/paystack";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import type { PendingTeam } from "@/lib/payment-verification";

export const dynamic = "force-dynamic";

/**
 * Initializes a Paystack transaction for either a tenant Essential-tier
 * subscription purchase, or an open-tournament team's entry-fee payment.
 * Never touches raw card data - Paystack's hosted checkout (authorization_url)
 * collects it; we only persist the reference and later verify server-side.
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const limit = rateLimit(`payments:init:${ip}`, 10, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    const body: unknown = await request.json();
    const input = paymentInitializeSchema.parse(body);
    const siteUrl = process.env.PUBLIC_SITE_URL ?? "http://localhost:3000";
    const callbackUrl = `${siteUrl}/payment-success`;
    console.log(`[initialize] mode=${input.mode} PUBLIC_SITE_URL=${process.env.PUBLIC_SITE_URL ?? "(unset)"} callbackUrl=${callbackUrl}`);

    if (input.mode === "subscription") {
      const ctx = await requireAuth();
      if (!hasRole(ctx, "TENANT_OWNER") && !isSuperAdmin(ctx)) {
        throw new AuthorizationError("Only a tenant owner can purchase a subscription");
      }
      if (!ctx.tenantId) throw new AuthorizationError("No tenant is associated with this account");
      if (!input.planId) throw new Error("planId is required for subscription mode");

      const plan = await prisma.subscriptionPlan.findUnique({ where: { id: input.planId } });
      if (!plan || !plan.isActive) throw new Error("Selected plan is not available");

      const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
      if (!tenant) throw new Error("Tenant not found");

      const reference = generatePaymentReference("sub");
      await prisma.paymentTransaction.create({
        data: {
          tenantId: ctx.tenantId,
          planId: plan.id,
          paystackReference: reference,
          amountKes: plan.priceKes,
          status: "PENDING",
        },
      });

      const paystackRes = await initializePaystackTransaction({
        email: tenant.email,
        amountKobo: kesToKobo(plan.priceKes),
        reference,
        metadata: {
          mode: "subscription",
          tenantId: ctx.tenantId,
          planId: plan.id,
          championshipId: input.championshipId,
        },
        callbackUrl,
      });

      return NextResponse.json({ authorizationUrl: paystackRes.data.authorization_url, reference });
    }

    // team_fee mode: open-tournament teams pay directly, no tenant auth required.
    if (!input.feeId) throw new Error("feeId is required for team_fee mode");
    const fee = await prisma.championshipFee.findUnique({
      where: { id: input.feeId },
      include: { championship: { select: { level: true, tenantId: true, isPublished: true } } },
    });
    // Unpublished championships aren't open for public registration/payment.
    if (!fee || !fee.championship.isPublished) throw new Error("Fee not found");

    // Only OPEN_TOURNAMENT championships settle registration fees to the
    // manager's own Paystack subaccount (see /api/tenant/payout-account) -
    // school-ladder championships (Zone/Sub-County/.../National) keep the
    // prior, unchanged behavior of settling to Zaroda's main account.
    let subaccountCode: string | undefined;
    if (fee.championship.level === "OPEN_TOURNAMENT") {
      const tenant = await prisma.tenant.findUnique({
        where: { id: fee.championship.tenantId },
        select: { subaccountStatus: true, paystackSubaccountCode: true },
      });
      if (!tenant || tenant.subaccountStatus !== "ACTIVE" || !tenant.paystackSubaccountCode) {
        throw new Error(
          "This championship's manager has not yet configured their bank payout account - team registration payments cannot be accepted until they do.",
        );
      }
      subaccountCode = tenant.paystackSubaccountCode;
    }

    if (!input.contactEmail) throw new Error("contactEmail is required for team_fee mode");

    let teamId: string | null = null;
    let pendingTeam: PendingTeam | null = null;
    if (input.teamId) {
      const team = await prisma.tournamentTeam.findUnique({ where: { id: input.teamId } });
      if (!team || team.championshipId !== fee.championshipId) throw new Error("Team not found");
      teamId = team.id;
    } else {
      // Anonymous team self-registration only exists for open tournaments
      // (the public /register page) - school-ladder teams are added by staff.
      if (fee.championship.level !== "OPEN_TOURNAMENT") {
        throw new Error("Teams can only self-register for open tournaments");
      }
      if (!input.teamName || !input.teamCode) {
        throw new Error("teamName and teamCode are required to register a new team");
      }
      const clash = await prisma.tournamentTeam.findFirst({
        where: {
          championshipId: fee.championshipId,
          OR: [{ teamCode: input.teamCode }, { gameId: null, name: { equals: input.teamName.trim(), mode: "insensitive" } }],
        },
        select: { teamCode: true },
      });
      if (clash) {
        throw new Error(
          clash.teamCode === input.teamCode
            ? "That team code is already used in this championship"
            : "A team with this name is already registered in this championship",
        );
      }
      // The team itself is only created once Paystack confirms payment (see
      // lib/payment-verification.ts) - abandoned checkouts leave no team behind.
      pendingTeam = {
        name: input.teamName,
        teamCode: input.teamCode,
        gender: input.teamGender ?? "MIXED",
        contactName: input.contactName ?? null,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone ?? null,
      };
    }

    const reference = generatePaymentReference("fee");
    await prisma.teamFeePayment.create({
      data: {
        teamId,
        pendingTeam: pendingTeam ? (pendingTeam as unknown as Prisma.InputJsonObject) : undefined,
        feeId: fee.id,
        championshipId: fee.championshipId,
        amountKes: fee.amountKes,
        status: "PENDING",
        paystackReference: reference,
      },
    });

    const paystackRes = await initializePaystackTransaction({
      email: input.contactEmail,
      amountKobo: kesToKobo(fee.amountKes),
      reference,
      metadata: { mode: "team_fee", teamId: teamId ?? undefined, feeId: fee.id, championshipId: fee.championshipId },
      callbackUrl,
      subaccount: subaccountCode,
    });

    return NextResponse.json({ authorizationUrl: paystackRes.data.authorization_url, reference });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
