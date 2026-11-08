import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/authorize";
import { sameArea } from "@/lib/jurisdiction";

export const dynamic = "force-dynamic";

export interface SignupAreas {
  /** Zones, with the sub-county a signed-up school put them in (null when only a championship names it). */
  zones: Array<{ name: string; subcounty: string | null }>;
  /** Bases, with the zone a signed-up school put them in (null when only a championship names it). */
  bases: Array<{ name: string; zone: string | null }>;
}

/**
 * The zones and bases already known in a county, offered as a school signs up
 * so it can pick its place in the chain rather than type it afresh. Schools
 * that signed up place each base in a zone and each zone in a sub-county;
 * running championships add the names nobody has signed up under yet.
 */
export async function GET(request: Request) {
  try {
    const county = new URL(request.url).searchParams.get("county")?.trim();
    if (!county) return NextResponse.json({ zones: [], bases: [] } satisfies SignupAreas);

    const [schools, championships] = await Promise.all([
      prisma.schoolAccount.findMany({ where: { county }, select: { baseName: true, zone: true, subcounty: true } }),
      prisma.championship.findMany({
        where: { level: { in: ["BASE", "ZONE"] }, isPublished: true, endDate: { gte: new Date() }, jurisdiction: { not: null } },
        select: { level: true, county: true, jurisdiction: true },
      }),
    ]);

    const zones: SignupAreas["zones"] = [];
    const bases: SignupAreas["bases"] = [];
    const addZone = (name: string, subcounty: string | null) => {
      if (name.trim() && !zones.some((z) => sameArea(z.name, name))) zones.push({ name: name.trim(), subcounty });
    };
    const addBase = (name: string, zone: string | null) => {
      if (name.trim() && !bases.some((b) => sameArea(b.name, name))) bases.push({ name: name.trim(), zone });
    };

    // Schools first, so a name they placed keeps its parent.
    for (const s of schools) {
      addZone(s.zone, s.subcounty);
      addBase(s.baseName, s.zone);
    }
    for (const c of championships) {
      if (!c.jurisdiction || !sameArea(c.county, county)) continue;
      if (c.level === "ZONE") addZone(c.jurisdiction, null);
      else addBase(c.jurisdiction, null);
    }

    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    return NextResponse.json({ zones: zones.sort(byName), bases: bases.sort(byName) } satisfies SignupAreas);
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
