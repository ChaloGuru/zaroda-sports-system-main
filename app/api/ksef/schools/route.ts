import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { toErrorResponse } from "@/lib/authorize";
import { getEditableEdition, requireKsefAdmin } from "@/lib/ksef";
import { regionForCounty } from "@/lib/ksef-config";
import { ksefSchoolSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

/**
 * ?editionId=  -> the edition's registered schools (with project counts).
 * ?editionId=&search= -> existing schools in the system, not yet in this
 * edition, whose name matches - so a school already known to Zaroda is
 * reused rather than re-typed.
 */
export async function GET(request: Request) {
  try {
    await requireKsefAdmin();
    const { searchParams } = new URL(request.url);
    const editionId = searchParams.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId is required" }, { status: 400 });
    const search = searchParams.get("search")?.trim();

    if (search !== undefined) {
      if (search.length < 2) return NextResponse.json({ schools: [] });
      const matches = await prisma.school.findMany({
        where: { name: { contains: search, mode: "insensitive" }, ksefEditions: { none: { editionId } } },
        select: { id: true, name: true, subcounty: true, county: true, schoolLevel: true },
        orderBy: { name: "asc" },
        take: 50,
      });
      // The same school can appear once per championship it was added to -
      // offer each name + sub-county + county once.
      const seen = new Set<string>();
      const schools = matches.filter((s) => {
        const key = `${s.name.toLowerCase()}|${s.subcounty.toLowerCase()}|${s.county.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return NextResponse.json({ schools: schools.slice(0, 15) });
    }

    const links = await prisma.ksefEditionSchool.findMany({
      where: { editionId },
      include: {
        school: {
          select: {
            id: true,
            name: true,
            zone: true,
            subcounty: true,
            county: true,
            region: true,
            _count: { select: { ksefProjects: { where: { editionId } } } },
          },
        },
      },
      orderBy: { school: { name: "asc" } },
    });
    return NextResponse.json({
      schools: links.map((l) => ({
        id: l.id,
        schoolId: l.school.id,
        name: l.school.name,
        zone: l.school.zone,
        subcounty: l.school.subcounty,
        county: l.school.county,
        region: l.school.region,
        projectCount: l.school._count.ksefProjects,
      })),
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/** Registers a school for the edition - an existing school by id, or a new one. */
export async function POST(request: Request) {
  try {
    const ctx = await requireKsefAdmin();
    const input = ksefSchoolSchema.parse(await request.json());
    await getEditableEdition(input.editionId);

    const link = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "ksef_edition_schools",
      mutate: async (tx) => {
        const schoolId =
          "schoolId" in input
            ? input.schoolId
            : (
                await tx.school.create({
                  data: {
                    name: input.name,
                    county: input.county,
                    subcounty: input.subcounty,
                    zone: input.zone || input.subcounty,
                    region: regionForCounty(input.county),
                  },
                })
              ).id;
        return tx.ksefEditionSchool.create({ data: { editionId: input.editionId, schoolId } });
      },
      recordId: (result) => result.id,
      newData: input,
    });
    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
