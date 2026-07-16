import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import {
  getAuthContext,
  isSuperAdmin,
  hasRole,
  requireChampionshipAccess,
  toErrorResponse,
  AuthorizationError,
} from "@/lib/authorize";
import { championshipUpdateSchema } from "@/lib/validations";
import { LEVEL_LABELS, withLevelInName } from "@/lib/utils";

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
    const existing = await prisma.championship.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Championship not found" }, { status: 404 });

    // Championship-scoped TOURNAMENT_ADMIN (assigned via Roles, not
    // necessarily the tenant owner) can edit the championship they're
    // running, not just SUPER_ADMIN/TENANT_OWNER.
    const ctx = await requireChampionshipAccess(params.id, ["TOURNAMENT_ADMIN"]);
    const body: unknown = await request.json();
    const input = championshipUpdateSchema.parse(body);

    if (input.tenantId && input.tenantId !== existing.tenantId) {
      // Reassigning the owning tenant is a super-admin-only move: it's how a
      // championship a super admin created ahead of time (before the real
      // tenant had subscribed) gets handed off to them afterwards.
      if (!isSuperAdmin(ctx)) {
        throw new AuthorizationError("Only a super admin can transfer a championship to another tenant");
      }
      const targetTenant = await prisma.tenant.findUnique({ where: { id: input.tenantId } });
      if (!targetTenant) throw new AuthorizationError("Target tenant not found", 400);
    }

    if (input.level && input.level !== existing.level) {
      // Changing level affects billing - a tenant owner could otherwise pay
      // for one championship at a low level, then re-use it at a higher
      // level without buying a matching plan. Only a super admin may change
      // the level after creation.
      if (!isSuperAdmin(ctx)) {
        throw new AuthorizationError("Only a super admin can change a championship's level after creation");
      }
      const oldLabel = LEVEL_LABELS[existing.level];
      const baseName = (input.name ?? existing.name).replace(new RegExp(`\\s*-\\s*${oldLabel}$`, "i"), "");
      input.name = withLevelInName(baseName, input.level);
    } else if (input.name) {
      input.name = withLevelInName(input.name, existing.level);
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
    const existing = await prisma.championship.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Championship not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(params.id, ["TOURNAMENT_ADMIN"]);

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
