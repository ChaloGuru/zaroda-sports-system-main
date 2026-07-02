import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireTenantAccess, requireRole, toErrorResponse } from "@/lib/authorize";

export const dynamic = "force-dynamic";

const tenantUpdateSchema = z.object({
  organizationName: z.string().min(2).max(200).optional(),
  contactName: z.string().min(2).max(200).optional(),
  phone: z.string().min(7).max(20).optional(),
  county: z.string().optional(),
  subcounty: z.string().optional(),
});

const subscriptionOverrideSchema = z.object({
  subscriptionId: z.string().uuid(),
  status: z.enum(["TRIAL", "ACTIVE", "EXPIRED"]),
  expiresAt: z.coerce.date().optional(),
});

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireTenantAccess(params.id);

    const tenant = await prisma.tenant.findUnique({
      where: { id: params.id },
      include: {
        championships: { orderBy: { createdAt: "desc" } },
        subscriptions: { orderBy: { createdAt: "desc" }, include: { plan: true } },
      },
    });
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    return NextResponse.json({ tenant });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/** Profile edits: tenant owner or super admin. Subscription overrides: super admin only. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireTenantAccess(params.id);
    const body: unknown = await request.json();

    if (body && typeof body === "object" && "subscriptionOverride" in body) {
      const superAdminCtx = await requireRole(["SUPER_ADMIN"]);
      const override = subscriptionOverrideSchema.parse((body as { subscriptionOverride: unknown }).subscriptionOverride);

      const existing = await prisma.championshipSubscription.findUnique({ where: { id: override.subscriptionId } });
      if (!existing || existing.tenantId !== params.id) {
        return NextResponse.json({ error: "Subscription not found for this tenant" }, { status: 404 });
      }

      const updated = await withAudit({
        actorId: superAdminCtx.userId,
        operation: "UPDATE",
        tableName: "championship_subscriptions",
        oldData: existing,
        mutate: (tx) =>
          tx.championshipSubscription.update({
            where: { id: override.subscriptionId },
            data: { status: override.status, expiresAt: override.expiresAt ?? existing.expiresAt },
          }),
        recordId: () => override.subscriptionId,
        newData: override,
      });

      return NextResponse.json({ subscription: updated });
    }

    const input = tenantUpdateSchema.parse(body);
    const existing = await prisma.tenant.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const updated = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "tenants",
      oldData: existing,
      mutate: (tx) => tx.tenant.update({ where: { id: params.id }, data: input }),
      recordId: () => params.id,
      newData: input,
    });

    return NextResponse.json({ tenant: updated });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
