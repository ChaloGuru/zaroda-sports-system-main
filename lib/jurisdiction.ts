// Where a school belongs on the competition ladder. A school can only go to a
// championship in its own area for that level. Safe to import from client code.

/** The levels whose championships name their area in Championship.jurisdiction. */
export const JURISDICTION_LABELS: Record<string, string> = {
  BASE: "Inter School base",
  ZONE: "Zone",
  SUB_COUNTY: "Sub-county",
  REGIONAL: "Region",
};

export function needsJurisdiction(level: string): boolean {
  return level in JURISDICTION_LABELS;
}

export interface SchoolArea {
  baseName?: string | null;
  zone?: string | null;
  subcounty?: string | null;
  county?: string | null;
  region?: string | null;
}

export interface ChampionshipArea {
  level: string;
  county: string;
  jurisdiction?: string | null;
}

// Words people add around an area's name: "Oruba", "Oruba Base" and "ORUBA
// INTER SCHOOL BASE" are all one place. Only ever compared within one level, so
// dropping them can't make a base match a zone of the same name.
const AREA_WORDS = /( (inter ?school|base|zone|sub ?county|county|region))+$/;

function areaKey(value: string): string {
  const name = value
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return name.replace(AREA_WORDS, "") || name;
}

/** Whether two typed area names are the same place, however they were spelt out. */
export function sameArea(a: string, b: string): boolean {
  return areaKey(a) === areaKey(b);
}

/**
 * Whether a school is inside a championship's jurisdiction. A side that hasn't
 * recorded its area doesn't block: schools an admin typed in have only a name,
 * and older championships have no jurisdiction. National is open to everyone.
 */
export function isInJurisdiction(school: SchoolArea, championship: ChampionshipArea): boolean {
  const areas: Record<string, [string | null | undefined, string | null | undefined]> = {
    BASE: [school.baseName, championship.jurisdiction],
    ZONE: [school.zone, championship.jurisdiction],
    SUB_COUNTY: [school.subcounty, championship.jurisdiction],
    COUNTY: [school.county, championship.county],
    REGIONAL: [school.region, championship.jurisdiction],
  };
  const [own, target] = areas[championship.level] ?? [null, null];
  if (!own?.trim() || !target?.trim()) return true;
  return sameArea(own, target);
}

export interface AreaChain {
  baseName: string;
  zone: string;
  subcounty: string;
}

/**
 * Where a signing-up school's chain breaks against schools already signed up in
 * its county: a base sits in one zone, and a zone in one sub-county. Null when
 * it fits, or nobody has signed up there yet.
 */
export function findChainConflict(school: AreaChain, known: AreaChain[]): { field: "zone" | "subcounty"; message: string } | null {
  for (const other of known) {
    if (sameArea(other.baseName, school.baseName) && !sameArea(other.zone, school.zone)) {
      return { field: "zone", message: `The base "${other.baseName}" is in the zone "${other.zone}" - check your zone and base` };
    }
  }
  for (const other of known) {
    if (sameArea(other.zone, school.zone) && !sameArea(other.subcounty, school.subcounty)) {
      return { field: "subcounty", message: `The zone "${other.zone}" is in ${other.subcounty} sub-county - check your sub-county and zone` };
    }
  }
  return null;
}

/** Whether a school can push to an Inter School championship: same county, and its base when one is set. */
export function isOpenToSchool(school: SchoolArea & { county: string }, championship: ChampionshipArea): boolean {
  return championship.level === "BASE" && sameArea(school.county, championship.county) && isInJurisdiction(school, championship);
}
