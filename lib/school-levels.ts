// Shared display labels for the SchoolLevel enum (prisma/schema.prisma).

// Championship.schoolLevel: the subscription/pricing tier. Primary and Junior
// Secondary are bundled as one tier here.
export const SCHOOL_LEVELS = [
  { value: "PRIMARY_JS", label: "Primary/JS" },
  { value: "SENIOR_SCHOOL", label: "Senior School" },
  { value: "TERTIARY", label: "Tertiary" },
] as const;

// Game.schoolLevel: more granular. Within a PRIMARY_JS championship each event
// is individually Primary or JS; used by the Add Game form (only the Primary/
// JS choice is ever shown - Senior School/Tertiary championships auto-set
// their one matching value and hide the field) and by rankings/report filters.
export const GAME_SCHOOL_LEVELS = [
  { value: "PRIMARY", label: "Primary" },
  { value: "JS", label: "JS" },
  { value: "SENIOR_SCHOOL", label: "Senior School" },
  { value: "TERTIARY", label: "Tertiary" },
] as const;

export type SchoolLevelValue = (typeof SCHOOL_LEVELS)[number]["value"];
export type GameSchoolLevelValue = (typeof GAME_SCHOOL_LEVELS)[number]["value"];

export function schoolLevelLabel(value: string): string {
  return SCHOOL_LEVELS.find((l) => l.value === value)?.label ?? value;
}

export function gameSchoolLevelLabel(value: string): string {
  return GAME_SCHOOL_LEVELS.find((l) => l.value === value)?.label ?? value;
}

/**
 * Within a Primary/JS championship every school is split into a Primary and
 * a JS entry (School.schoolLevel) - label them so the two can be told apart.
 * Senior School / Tertiary schools (no level) show just their name.
 */
export function schoolEntryLabel(name: string, schoolLevel: string | null | undefined): string {
  return schoolLevel ? `${name} (${gameSchoolLevelLabel(schoolLevel)})` : name;
}

/** The levels each school is split into when added to a championship at this tier. */
export function schoolEntryLevels(championshipSchoolLevel: string): Array<"PRIMARY" | "JS" | null> {
  return championshipSchoolLevel === "PRIMARY_JS" ? ["PRIMARY", "JS"] : [null];
}
