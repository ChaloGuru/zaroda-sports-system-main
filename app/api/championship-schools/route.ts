import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import {
  getAuthContext,
  canViewChampionshipPrivateData,
  requireChampionshipAccess,
  isGeographicallyRestricted,
  assertWithinGeographicScope,
  toErrorResponse,
} from "@/lib/authorize";
import { championshipSchoolsAddSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

export interface ChampionshipSchoolRow {
  /** The ChampionshipSchool link id - what PATCH/DELETE address. */
  id: string;
  schoolId: string;
  name: string;
  county: string;
  participantCount: number;
  hasBibRange: boolean;
}

/** Lists a championship's own schools (public once published, like its results). */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const championshipId = searchParams.get("championshipId");
    if (!championshipId) return NextResponse.json({ error: "championshipId is required" }, { status: 400 });

    const championship = await prisma.championship.findUnique({
      where: { id: championshipId },
      select: { id: true, tenantId: true, isPublished: true },
    });
    if (!championship) return NextResponse.json({ schools: [] });
    if (!championship.isPublished && !canViewChampionshipPrivateData(await getAuthContext(), championship)) {
      return NextResponse.json({ schools: [] });
    }

    const [links, participantCounts, bibRanges] = await Promise.all([
      prisma.championshipSchool.findMany({
        where: { championshipId },
        include: { school: { select: { id: true, name: true, county: true } } },
      }),
      prisma.participant.groupBy({
        by: ["schoolId"],
        where: { championshipId, schoolId: { not: null } },
        _count: { _all: true },
      }),
      prisma.schoolBibRange.findMany({ where: { championshipId }, select: { schoolId: true } }),
    ]);
    const countBySchool = new Map(participantCounts.map((c) => [c.schoolId, c._count._all]));
    const withRange = new Set(bibRanges.map((r) => r.schoolId));

    const schools: ChampionshipSchoolRow[] = links
      .map((link) => ({
        id: link.id,
        schoolId: link.school.id,
        name: link.school.name,
        county: link.school.county,
        participantCount: countBySchool.get(link.school.id) ?? 0,
        hasBibRange: withRange.has(link.school.id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ schools });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/** Adds schools to a championship's list. Names already on the list are skipped. */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const input = championshipSchoolsAddSchema.parse(body);
    const ctx = await requireChampionshipAccess(input.championshipId, ["TOURNAMENT_ADMIN"]);

    const championship = await prisma.championship.findUniqueOrThrow({
      where: { id: input.championshipId },
      select: { county: true, level: true },
    });
    const county = input.county || championship.county;
    // Lower-level championships only admit schools from their own county
    // (the same rule participants are checked against) - catch it here
    // rather than at athlete registration.
    if (isGeographicallyRestricted(championship.level)) {
      assertWithinGeographicScope(championship.county, county);
    }

    const existing = await prisma.championshipSchool.findMany({
      where: { championshipId: input.championshipId },
      select: { school: { select: { name: true } } },
    });
    const taken = new Set(existing.map((l) => l.school.name.trim().toLowerCase()));
    const toAdd: string[] = [];
    for (const name of input.names) {
      const key = name.toLowerCase();
      if (taken.has(key)) continue;
      taken.add(key);
      toAdd.push(name);
    }

    if (toAdd.length > 0) {
      await withAudit({
        actorId: ctx.userId,
        operation: "INSERT",
        tableName: "championship_schools",
        mutate: async (tx) => {
          // Two batch inserts (ids generated up front) rather than one round
          // trip per school, so large lists stay well inside the transaction
          // timeout. zone/subcounty/region aren't collected here; county is
          // what geographic-scope checks rely on.
          const schools = toAdd.map((name) => ({ id: randomUUID(), name, county, zone: "", subcounty: "", region: "" }));
          await tx.school.createMany({ data: schools });
          await tx.championshipSchool.createMany({
            data: schools.map((s) => ({ championshipId: input.championshipId, schoolId: s.id })),
          });
          return schools.length;
        },
        recordId: () => input.championshipId,
        newData: { names: toAdd, county },
      });
    }

    return NextResponse.json({ added: toAdd.length, skipped: input.names.length - toAdd.length }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
