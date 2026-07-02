import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, toErrorResponse } from "@/lib/authorize";

export const dynamic = "force-dynamic";

/** Super-admin-only: list all tenants across the platform. */
export async function GET() {
  try {
    await requireRole(["SUPER_ADMIN"]);

    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { championships: true } },
        subscriptions: { where: { status: "ACTIVE" }, include: { plan: true } },
      },
    });

    return NextResponse.json({ tenants });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
