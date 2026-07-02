import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/authorize";

export const dynamic = "force-dynamic";

/** Public: list active Essential subscription plans (used to render pricing/subscribe CTAs). */
export async function GET() {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { priceKes: "asc" },
    });
    return NextResponse.json({ plans });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
