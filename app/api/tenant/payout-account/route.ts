import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, hasRole, isSuperAdmin, toErrorResponse, AuthorizationError } from "@/lib/authorize";
import { payoutAccountSchema } from "@/lib/validations";
import { createPaystackSubaccount } from "@/lib/paystack";

export const dynamic = "force-dynamic";

/**
 * A tenant's Paystack Subaccount settlement account, for open-tournament
 * team registration fees - entirely separate from the Zaroda subscription
 * flow (ChampionshipSubscription/PaymentTransaction), which this never touches.
 */
export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx.tenantId) throw new AuthorizationError("No tenant is associated with this account");

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: {
        subaccountStatus: true,
        settlementBankName: true,
        settlementBankCode: true,
        settlementAccountNumber: true,
        settlementAccountName: true,
      },
    });
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    return NextResponse.json({ payoutAccount: tenant });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasRole(ctx, "TENANT_OWNER") && !isSuperAdmin(ctx)) {
      throw new AuthorizationError("Only a tenant owner can configure a payout account");
    }
    if (!ctx.tenantId) throw new AuthorizationError("No tenant is associated with this account");

    const body: unknown = await request.json();
    const input = payoutAccountSchema.parse(body);

    const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    // Mark PENDING before calling out to Paystack so a crash mid-request
    // never leaves a stale ACTIVE/NOT_CONFIGURED status with mismatched details.
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        subaccountStatus: "PENDING",
        settlementBankCode: input.settlementBankCode,
        settlementBankName: input.settlementBankName,
        settlementAccountNumber: input.accountNumber,
      },
    });

    try {
      const result = await createPaystackSubaccount({
        businessName: tenant.organizationName,
        settlementBankCode: input.settlementBankCode,
        accountNumber: input.accountNumber,
      });

      const updated = await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          paystackSubaccountCode: result.data.subaccount_code,
          settlementAccountName: result.data.account_name,
          subaccountStatus: "ACTIVE",
        },
        select: {
          subaccountStatus: true,
          settlementBankName: true,
          settlementBankCode: true,
          settlementAccountNumber: true,
          settlementAccountName: true,
        },
      });

      return NextResponse.json({ payoutAccount: updated }, { status: 201 });
    } catch (paystackError) {
      // Paystack rejected the account (invalid number, unsupported bank,
      // etc.) - do not leave partial/incorrect data looking configured.
      await prisma.tenant.update({ where: { id: tenant.id }, data: { subaccountStatus: "FAILED" } });
      throw paystackError;
    }
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
