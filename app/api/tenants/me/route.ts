import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, toErrorResponse, AuthorizationError } from "@/lib/authorize";

export const dynamic = "force-dynamic";

/** Convenience endpoint: the signed-in tenant owner's own tenant + active subscriptions. */
export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx.tenantId) throw new AuthorizationError("No tenant associated with this account");

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      include: { subscriptions: { where: { status: "ACTIVE" }, include: { plan: true } } },
    });
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    return NextResponse.json({ tenant });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
