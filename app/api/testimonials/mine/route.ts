import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, toErrorResponse } from "@/lib/authorize";

export const dynamic = "force-dynamic";

// The caller's own testimonial, if any - so the dashboard prompt shows it
// (with a delete option) instead of asking them to write another.
export async function GET() {
  try {
    const ctx = await requireAuth();
    const testimonial = await prisma.testimonial.findUnique({
      where: { userId: ctx.userId },
      select: { id: true, message: true, rating: true, status: true },
    });
    return NextResponse.json({ testimonial });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
