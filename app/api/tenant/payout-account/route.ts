import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, hasRole, isSuperAdmin, toErrorResponse, AuthorizationError } from "@/lib/authorize";
import { payoutAccountSchema } from "@/lib/validations";
import { encryptSecret } from "@/lib/secret-box";
import { checkTumaCredentials } from "@/lib/tuma";

export const dynamic = "force-dynamic";

const SHOWN = { subaccountStatus: true, tumaEmail: true } as const;

/**
 * A manager's own TUMA account, for open-tournament team registration fees: teams pay by M-Pesa straight into it
 * (as POS shops collect their own online orders). Entirely separate from Zaroda subscriptions.
 * subaccountStatus ACTIVE means connected. The API key is never sent back.
 */
function tenantFor(ctx: Awaited<ReturnType<typeof requireAuth>>, requested: string | null | undefined): string {
  // A super admin has no tenant of their own - they name the tenant.
  const tenantId = isSuperAdmin(ctx) && requested ? requested : ctx.tenantId;
  if (!tenantId) throw new AuthorizationError("No tenant is associated with this account");
  return tenantId;
}

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const tenantId = tenantFor(ctx, new URL(request.url).searchParams.get("tenantId"));
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: SHOWN });
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    return NextResponse.json({ payoutAccount: tenant });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/** Connects (or replaces) the TUMA account, after checking with TUMA that the details sign in. */
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasRole(ctx, "TENANT_OWNER") && !isSuperAdmin(ctx)) throw new AuthorizationError("Only a tenant owner can connect a payout account");
    const input = payoutAccountSchema.parse(await request.json());
    const tenantId = tenantFor(ctx, input.tenantId);
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const email = input.tumaEmail.trim().toLowerCase();
    const apiKey = input.tumaApiKey.trim();
    try {
      await checkTumaCredentials({ email, apiKey });
    } catch (error) {
      const message = error instanceof Error ? error.message : "TUMA did not accept these details";
      return NextResponse.json({ error: `TUMA did not accept these details: ${message}` }, { status: 400 });
    }

    const updated = await prisma.tenant.update({
      where: { id: tenant.id },
      data: { tumaEmail: email, tumaApiKeyEncrypted: encryptSecret(apiKey), subaccountStatus: "ACTIVE" },
      select: SHOWN,
    });
    return NextResponse.json({ payoutAccount: updated }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/** Disconnects the TUMA account: open-tournament teams can't pay until one is connected again. */
export async function DELETE(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasRole(ctx, "TENANT_OWNER") && !isSuperAdmin(ctx)) throw new AuthorizationError("Only a tenant owner can change the payout account");
    const tenantId = tenantFor(ctx, new URL(request.url).searchParams.get("tenantId"));
    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: { tumaEmail: null, tumaApiKeyEncrypted: null, subaccountStatus: "NOT_CONFIGURED" },
      select: SHOWN,
    });
    return NextResponse.json({ payoutAccount: updated });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
