import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, toErrorResponse } from "@/lib/authorize";

export const dynamic = "force-dynamic";

// The signed-in user's KSEF panel memberships (role per edition) in non-closed editions.
export async function GET() {
  try {
    const ctx = await requireAuth();
    const panels = await prisma.ksefJudge.findMany({
      where: { userId: ctx.userId, isActive: true, edition: { status: { not: "CLOSED" } } },
      select: { role: true, edition: { select: { id: true, name: true, year: true, levels: true } } },
      orderBy: { edition: { year: "desc" } },
    });
    return NextResponse.json({ panels });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
