import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/authorize";
import { paymentInitializeSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import type { PendingTeam } from "@/lib/payment-verification";
import { decryptSecret } from "@/lib/secret-box";
import {
  CALLBACK_BASE,
  generatePaymentReference,
  normaliseKenyanPhone,
  randomSecret,
  sha256,
  tumaConfigured,
  tumaStkPush,
  type TumaCredentials,
} from "@/lib/tuma";

export const dynamic = "force-dynamic";

/**
 * Starts paying a team's registration fee by M-Pesa: TUMA sends the PIN prompt to the contact's phone.
 * An open tournament's fee goes straight into its manager's own TUMA account; a school-ladder fee into Zaroda's.
 * A self-registering team is only created once TUMA's notification confirms the payment (./tuma-callback),
 * so an abandoned prompt leaves no team behind. The page polls GET for the outcome.
 */
export async function POST(request: Request) {
  try {
    const limit = await rateLimit(`payments:init:${getClientIp(request)}`, 10, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    const input = paymentInitializeSchema.parse(await request.json());
    if (input.mode === "subscription") {
      return NextResponse.json({ error: "Subscriptions are paid by M-Pesa now - refresh the page and subscribe again" }, { status: 400 });
    }

    if (!input.feeId) throw new Error("feeId is required for team_fee mode");
    const fee = await prisma.championshipFee.findUnique({
      where: { id: input.feeId },
      include: { championship: { select: { level: true, tenantId: true, isPublished: true, name: true } } },
    });
    // Unpublished championships aren't open for public registration/payment.
    if (!fee || !fee.championship.isPublished) throw new Error("Fee not found");

    const phone = normaliseKenyanPhone(input.contactPhone ?? "");
    if (!phone) return NextResponse.json({ error: "Enter the M-Pesa number to pay from, e.g. 0712 345 678" }, { status: 400 });

    // Whose account the money goes into.
    let account: TumaCredentials | undefined;
    if (fee.championship.level === "OPEN_TOURNAMENT") {
      const tenant = await prisma.tenant.findUnique({
        where: { id: fee.championship.tenantId },
        select: { subaccountStatus: true, tumaEmail: true, tumaApiKeyEncrypted: true },
      });
      if (!tenant || tenant.subaccountStatus !== "ACTIVE" || !tenant.tumaEmail || !tenant.tumaApiKeyEncrypted) {
        throw new Error(
          "This championship's manager has not connected their M-Pesa (TUMA) account yet - team registration payments can't be taken until they do.",
        );
      }
      account = { email: tenant.tumaEmail, apiKey: decryptSecret(tenant.tumaApiKeyEncrypted) };
    } else if (!tumaConfigured()) {
      return NextResponse.json({ error: "M-Pesa payment isn't available yet - contact Zaroda on 0781230805" }, { status: 503 });
    }

    if (!input.contactEmail) throw new Error("contactEmail is required for team_fee mode");

    let teamId: string | null = null;
    let pendingTeam: PendingTeam | null = null;
    if (input.teamId) {
      const team = await prisma.tournamentTeam.findUnique({ where: { id: input.teamId } });
      if (!team || team.championshipId !== fee.championshipId) throw new Error("Team not found");
      teamId = team.id;
    } else {
      // Anonymous team self-registration only exists for open tournaments (the public /register page).
      if (fee.championship.level !== "OPEN_TOURNAMENT") throw new Error("Teams can only self-register for open tournaments");
      if (!input.teamName || !input.teamCode) throw new Error("teamName and teamCode are required to register a new team");
      const clash = await prisma.tournamentTeam.findFirst({
        where: {
          championshipId: fee.championshipId,
          OR: [{ teamCode: input.teamCode }, { gameId: null, name: { equals: input.teamName.trim(), mode: "insensitive" } }],
        },
        select: { teamCode: true },
      });
      if (clash) {
        throw new Error(
          clash.teamCode === input.teamCode ? "That team code is already used in this championship" : "A team with this name is already registered in this championship",
        );
      }
      pendingTeam = {
        name: input.teamName,
        teamCode: input.teamCode,
        gender: input.teamGender ?? "MIXED",
        contactName: input.contactName ?? null,
        contactEmail: input.contactEmail,
        contactPhone: phone,
      };
    }

    // Don't send a second prompt to the same phone while one is still waiting.
    const waiting = await prisma.teamFeePayment.findFirst({
      where: { phone, provider: "TUMA", status: "PENDING", createdAt: { gte: new Date(Date.now() - 2 * 60_000) } },
      select: { id: true },
    });
    if (waiting) {
      return NextResponse.json({ error: "A payment prompt was sent to this phone in the last 2 minutes - check the phone, or try again shortly" }, { status: 429 });
    }

    const secret = randomSecret();
    const payment = await prisma.teamFeePayment.create({
      data: {
        teamId,
        pendingTeam: pendingTeam ? (pendingTeam as unknown as Prisma.InputJsonObject) : undefined,
        feeId: fee.id,
        championshipId: fee.championshipId,
        amountKes: fee.amountKes,
        status: "PENDING",
        paystackReference: generatePaymentReference("fee"),
        provider: "TUMA",
        phone,
        callbackSecretHash: sha256(secret),
      },
    });

    try {
      const push = await tumaStkPush(
        {
          amount: fee.amountKes,
          phone,
          description: `${fee.championship.name}: ${fee.name}`.slice(0, 100),
          callbackUrl: `${CALLBACK_BASE}/api/payments/tuma-callback?fee=${payment.id}&key=${secret}`,
        },
        account,
      );
      await prisma.teamFeePayment.update({ where: { id: payment.id }, data: { checkoutRequestId: push.checkout_request_id ?? null } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "TUMA didn't accept the request";
      await prisma.teamFeePayment.update({ where: { id: payment.id }, data: { status: "FAILED", message } });
      return NextResponse.json({ error: `Couldn't send the M-Pesa prompt: ${message}` }, { status: 502 });
    }

    return NextResponse.json({ paymentId: payment.id, amountKes: fee.amountKes, phone });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/** The outcome of a team fee payment, for the page waiting on it (the id is an unguessable uuid it was given). */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  const payment = await prisma.teamFeePayment.findUnique({
    where: { id },
    select: { status: true, message: true, mpesaReceipt: true, paystackReference: true, provider: true },
  });
  if (!payment || payment.provider !== "TUMA") return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  return NextResponse.json({ status: payment.status, message: payment.message, mpesaReceipt: payment.mpesaReceipt, reference: payment.paystackReference });
}
