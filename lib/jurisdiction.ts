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

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

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
  return normalize(own) === normalize(target);
}
