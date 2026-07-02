import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import {
  getAuthContext,
  isSuperAdmin,
  hasRole,
  requireActiveSubscriptionForLevel,
  toErrorResponse,
  AuthorizationError,
} from "@/lib/authorize";
import { championshipUpdateSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

async function loadChampionship(id: string) {
  return prisma.championship.findUnique({
    where: { id },
    include: {
      tenant: { select: { id: true, organizationName: true, accountType: true } },
      games: { orderBy: { name: "asc" } },
    },
  });
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const championship = await loadChampionship(params.id);
    if (!championship) return NextResponse.json({ error: "Championship not found" }, { status: 404 });

    if (!championship.isPublished) {
      const ctx = await getAuthContext();
      const owns = ctx && (isSuperAdmin(ctx) || (hasRole(ctx, "TENANT_OWNER") && ctx.tenantId === championship.tenantId));
      if (!owns) return NextResponse.json({ error: "Championship not found" }, { status: 404 });
    }

    return NextResponse.json({ championship });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) throw new AuthorizationError("Authentication required", 401);

    const existing = await prisma.championship.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Championship not found" }, { status: 404 });

    const owns = isSuperAdmin(ctx) || (hasRole(ctx, "TENANT_OWNER") && ctx.tenantId === existing.tenantId);
    if (!owns) throw new AuthorizationError("You do not have access to this championship");

    const body: unknown = await request.json();
    const input = championshipUpdateSchema.parse(body);

    if (input.level && input.level !== existing.level && !isSuperAdmin(ctx)) {
      await requireActiveSubscriptionForLevel(existing.tenantId, input.level);
    }

    const updated = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "championships",
      oldData: existing,
      mutate: (tx) => tx.championship.update({ where: { id: params.id }, data: input }),
      recordId: () => params.id,
      newData: input,
    });

    return NextResponse.json({ championship: updated });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) throw new AuthorizationError("Authentication required", 401);

    const existing = await prisma.championship.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Championship not found" }, { status: 404 });

    const owns = isSuperAdmin(ctx) || (hasRole(ctx, "TENANT_OWNER") && ctx.tenantId === existing.tenantId);
    if (!owns) throw new AuthorizationError("You do not have access to this championship");

    await withAudit({
      actorId: ctx.userId,
      operation: "DELETE",
      tableName: "championships",
      oldData: existing,
      mutate: (tx) => tx.championship.delete({ where: { id: params.id } }),
      recordId: () => params.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
