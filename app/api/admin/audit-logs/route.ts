import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, toErrorResponse } from "@/lib/authorize";

export const dynamic = "force-dynamic";

/** Read-only, super-admin-only view of the audit trail (§3 AuditLog). */
export async function GET(request: Request) {
  try {
    await requireRole(["SUPER_ADMIN"]);

    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get("tableName");
    const take = Math.min(Number(searchParams.get("take") ?? 100), 500);

    const logs = await prisma.auditLog.findMany({
      where: tableName ? { tableName } : undefined,
      orderBy: { changedAt: "desc" },
      take,
      include: { changer: { select: { name: true, email: true } } },
    });

    return NextResponse.json({ logs });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
