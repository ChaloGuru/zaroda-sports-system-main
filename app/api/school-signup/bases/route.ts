import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/authorize";
import { sameArea } from "@/lib/jurisdiction";

export const dynamic = "force-dynamic";

/** The bases of a county's running Inter School championships, offered as a school signs up. */
export async function GET(request: Request) {
  try {
    const county = new URL(request.url).searchParams.get("county")?.trim();
    if (!county) return NextResponse.json({ bases: [] });

    const championships = await prisma.championship.findMany({
      where: { level: "BASE", isPublished: true, endDate: { gte: new Date() }, jurisdiction: { not: null } },
      select: { county: true, jurisdiction: true },
    });

    const bases: string[] = [];
    for (const { county: own, jurisdiction } of championships) {
      const base = jurisdiction?.trim();
      if (base && sameArea(own, county) && !bases.some((b) => sameArea(b, base))) bases.push(base);
    }
    return NextResponse.json({ bases: bases.sort((a, b) => a.localeCompare(b)) });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
