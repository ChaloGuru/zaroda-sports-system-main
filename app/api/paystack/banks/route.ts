import { NextResponse } from "next/server";
import { requireAuth, hasRole, isSuperAdmin, toErrorResponse, AuthorizationError } from "@/lib/authorize";
import { listPaystackBanks } from "@/lib/paystack";

export const dynamic = "force-dynamic";

/**
 * Live list of Paystack-supported Kenyan banks, for the payout-account bank
 * selector - never hardcoded, since Paystack's supported set can change.
 */
export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!hasRole(ctx, "TENANT_OWNER") && !isSuperAdmin(ctx)) {
      throw new AuthorizationError("Only a tenant owner can view the bank list");
    }

    const banks = await listPaystackBanks();
    return NextResponse.json({ banks });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
