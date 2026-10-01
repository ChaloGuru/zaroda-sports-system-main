import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, toErrorResponse } from "@/lib/authorize";

export const dynamic = "force-dynamic";

// An edition's categories (with sub-categories) and judging criteria.
// Readable by any signed-in user - judges need the criteria, and none of
// this is private.
export async function GET(request: Request) {
  try {
    await requireAuth();
    const editionId = new URL(request.url).searchParams.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId is required" }, { status: 400 });

    const [categories, criteria] = await Promise.all([
      prisma.ksefCategory.findMany({
        where: { editionId },
        orderBy: [{ division: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
        include: {
          subCategories: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
          _count: { select: { projects: true } },
        },
      }),
      prisma.ksefCriterion.findMany({
        where: { editionId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { scores: true } } },
      }),
    ]);
    return NextResponse.json({ categories, criteria });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
