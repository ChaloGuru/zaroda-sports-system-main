import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/authorize";
import { requireKsefAdmin } from "@/lib/ksef";

export const dynamic = "force-dynamic";

/**
 * ?editionId= -> schools that registered themselves through the open link,
 * newest first. Pending ones come with existing schools in the same county
 * whose name looks the same, so the administrator can link to one instead
 * of creating a duplicate.
 */
export async function GET(request: Request) {
  try {
    await requireKsefAdmin();
    const editionId = new URL(request.url).searchParams.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId is required" }, { status: 400 });

    const registrations = await prisma.ksefSchoolRegistration.findMany({
      where: { editionId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        schoolName: true,
        county: true,
        subcounty: true,
        zone: true,
        divisions: true,
        contactName: true,
        contactEmail: true,
        contactPhone: true,
        status: true,
        rejectionReason: true,
        reviewedAt: true,
        createdAt: true,
        school: { select: { id: true, name: true } },
        reviewedBy: { select: { name: true } },
        _count: { select: { projects: true } },
      },
    });

    const withMatches = await Promise.all(
      registrations.map(async (r) => {
        if (r.status !== "PENDING") return { ...r, matches: [] };
        const words = r.schoolName.split(/\s+/).filter((w) => w.length >= 3 && !/^(school|secondary|primary|high|academy|girls|boys|mixed)$/i.test(w));
        const matches = await prisma.school.findMany({
          where: {
            id: { not: r.school?.id },
            county: { equals: r.county, mode: "insensitive" },
            ksefRegistrations: { none: { status: "PENDING" } },
            OR: [
              { name: { equals: r.schoolName, mode: "insensitive" } },
              ...words.map((w) => ({ name: { contains: w, mode: "insensitive" as const } })),
            ],
          },
          select: { id: true, name: true, subcounty: true, county: true },
          orderBy: { name: "asc" },
          take: 30,
        });
        // The same school can appear once per championship it was added to.
        const seen = new Set<string>();
        const unique = matches.filter((s) => {
          const key = `${s.name.toLowerCase()}|${s.subcounty.toLowerCase()}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return { ...r, matches: unique.slice(0, 8) };
      }),
    );
    return NextResponse.json({ registrations: withMatches });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
