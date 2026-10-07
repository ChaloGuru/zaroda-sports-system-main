import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import {
  getAuthContext,
  canSeeChampionship,
  requireChampionshipAccess,
  isGeographicallyRestricted,
  assertWithinGeographicScope,
  toErrorResponse,
} from "@/lib/authorize";
import { championshipSchoolsAddSchema } from "@/lib/validations";
import { schoolEntryLabel, schoolEntryLevels } from "@/lib/school-levels";
import type { SchoolLevel } from "@prisma/client";

export const dynamic = "force-dynamic";

const LEVEL_RANK = (level: string | null) => (level === "JS" ? 1 : 0);

export interface ChampionshipSchoolRow {
  /** The ChampionshipSchool link id - what PATCH/DELETE address. */
  id: string;
  schoolId: string;
  name: string;
  /** PRIMARY or JS for a Primary/JS championship's split entries; null otherwise. */
  schoolLevel: SchoolLevel | null;
  /** Name plus level, e.g. "Manyonge (JS)" - what pickers should display. */
  label: string;
  county: string;
  participantCount: number;
  teamCount: number;
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
    if (!(await canSeeChampionship(await getAuthContext(), championship))) {
      return NextResponse.json({ schools: [] });
    }

    const [links, participantCounts, teamCounts, bibRanges] = await Promise.all([
      prisma.championshipSchool.findMany({
        where: { championshipId },
        include: { school: { select: { id: true, name: true, county: true, schoolLevel: true } } },
      }),
      prisma.participant.groupBy({
        by: ["schoolId"],
        where: { championshipId, schoolId: { not: null } },
        _count: { _all: true },
      }),
      prisma.tournamentTeam.groupBy({
        by: ["schoolId"],
        where: { championshipId, schoolId: { not: null } },
        _count: { _all: true },
      }),
      prisma.schoolBibRange.findMany({ where: { championshipId }, select: { schoolId: true } }),
    ]);
    const countBySchool = new Map(participantCounts.map((c) => [c.schoolId, c._count._all]));
    const teamsBySchool = new Map(teamCounts.map((c) => [c.schoolId, c._count._all]));
    const withRange = new Set(bibRanges.map((r) => r.schoolId));

    const schools: ChampionshipSchoolRow[] = links
      .map((link) => ({
        id: link.id,
        schoolId: link.school.id,
        name: link.school.name,
        schoolLevel: link.school.schoolLevel,
        label: schoolEntryLabel(link.school.name, link.school.schoolLevel),
        county: link.school.county,
        participantCount: countBySchool.get(link.school.id) ?? 0,
        teamCount: teamsBySchool.get(link.school.id) ?? 0,
        hasBibRange: withRange.has(link.school.id),
      }))
      // Alphabetical, with each school's Primary entry before its JS entry.
      .sort((a, b) => a.name.localeCompare(b.name) || LEVEL_RANK(a.schoolLevel) - LEVEL_RANK(b.schoolLevel));

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
      select: { county: true, level: true, schoolLevel: true },
    });
    const county = input.county || championship.county;
    // Lower-level championships only admit schools from their own county
    // (the same rule participants are checked against) - catch it here
    // rather than at athlete registration.
    if (isGeographicallyRestricted(championship.level)) {
      assertWithinGeographicScope(championship.county, county);
    }

    // A Primary/JS championship splits every school into a Primary and a JS
    // entry (athletes enter per school level); other tiers get one entry.
    const levels = schoolEntryLevels(championship.schoolLevel);
    const entryKey = (name: string, level: string | null) => `${name.trim().toLowerCase()}::${level ?? ""}`;

    const existing = await prisma.championshipSchool.findMany({
      where: { championshipId: input.championshipId },
      select: { school: { select: { name: true, schoolLevel: true } } },
    });
    const taken = new Set(existing.map((l) => entryKey(l.school.name, l.school.schoolLevel)));
    // Only the missing entries are created - e.g. re-adding a school whose JS
    // entry was removed brings back just that one.
    const toAdd: Array<{ name: string; schoolLevel: "PRIMARY" | "JS" | null }> = [];
    let skipped = 0;
    for (const name of input.names) {
      const missing = levels.filter((level) => !taken.has(entryKey(name, level)));
      if (missing.length === 0) skipped++;
      for (const level of missing) {
        taken.add(entryKey(name, level));
        toAdd.push({ name, schoolLevel: level });
      }
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
          const schools = toAdd.map((entry) => ({
            id: randomUUID(),
            name: entry.name,
            schoolLevel: entry.schoolLevel,
            county,
            zone: "",
            subcounty: "",
            region: "",
          }));
          await tx.school.createMany({ data: schools });
          await tx.championshipSchool.createMany({
            data: schools.map((s) => ({ championshipId: input.championshipId, schoolId: s.id })),
          });
          return schools.length;
        },
        recordId: () => input.championshipId,
        newData: { entries: toAdd, county },
      });
    }

    return NextResponse.json(
      { added: input.names.length - skipped, entries: toAdd.length, skipped },
      { status: 201 },
    );
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
