// KSEF reference data and pure helpers - no server-only imports, so client
// components can use these too.
//
// STANDARD_KSEF_STRUCTURE is only a *starting point* offered when an
// administrator creates a new edition ("Start from the standard KSEF
// structure"). It's copied into that edition's own rows, after which the
// edition's categories and criteria are edited in KSEF -> Configuration -
// nothing here is read again for an existing edition, and no year is baked
// into it.

import type { KsefDivision, Level } from "@prisma/client";

export const KSEF_DIVISION_LABELS: Record<KsefDivision, string> = {
  JUNIOR_SCHOOL: "Junior School",
  SENIOR_SCHOOL: "Senior School",
};

export const KSEF_DIVISIONS: KsefDivision[] = ["JUNIOR_SCHOOL", "SENIOR_SCHOOL"];

/** The levels a KSEF edition can include, lowest first. */
export const KSEF_LEVELS: Level[] = ["SUB_COUNTY", "COUNTY", "REGIONAL", "NATIONAL"];

export interface StandardKsefCategory {
  division: KsefDivision;
  name: string;
  subCategories: string[];
}

export interface StandardKsefCriterion {
  /** null = applies to both Junior and Senior School projects. */
  division: KsefDivision | null;
  name: string;
  description: string;
  maxScore: number;
}

export const STANDARD_KSEF_STRUCTURE: { categories: StandardKsefCategory[]; criteria: StandardKsefCriterion[] } = {
  categories: [
    { division: "JUNIOR_SCHOOL", name: "Mathematical, Chemical and Physical Sciences", subCategories: [] },
    { division: "JUNIOR_SCHOOL", name: "Biological Sciences", subCategories: [] },
    { division: "JUNIOR_SCHOOL", name: "Agriculture and Food Technology", subCategories: [] },
    { division: "JUNIOR_SCHOOL", name: "Computer Science and Robotics", subCategories: [] },
    { division: "JUNIOR_SCHOOL", name: "Environmental Science and Energy", subCategories: [] },
    { division: "JUNIOR_SCHOOL", name: "Applied Technology and Engineering", subCategories: [] },
    { division: "JUNIOR_SCHOOL", name: "Behavioural Science", subCategories: [] },

    { division: "SENIOR_SCHOOL", name: "Mathematical Science", subCategories: [] },
    { division: "SENIOR_SCHOOL", name: "Physics", subCategories: [] },
    { division: "SENIOR_SCHOOL", name: "Chemistry", subCategories: [] },
    { division: "SENIOR_SCHOOL", name: "Biology and Biotechnology", subCategories: [] },
    { division: "SENIOR_SCHOOL", name: "Computer Science", subCategories: ["Software", "Hardware"] },
    { division: "SENIOR_SCHOOL", name: "Robotics", subCategories: [] },
    { division: "SENIOR_SCHOOL", name: "Agriculture", subCategories: [] },
    { division: "SENIOR_SCHOOL", name: "Food Technology, Textiles and Home Economics", subCategories: [] },
    { division: "SENIOR_SCHOOL", name: "Applied Technology and Engineering", subCategories: [] },
    { division: "SENIOR_SCHOOL", name: "Energy and Transport", subCategories: [] },
    { division: "SENIOR_SCHOOL", name: "Environmental Science", subCategories: [] },
    { division: "SENIOR_SCHOOL", name: "Behavioural Science", subCategories: [] },
  ],
  criteria: [
    { division: null, name: "Written communication", description: "Abstract and project report: clarity, structure, referencing.", maxScore: 20 },
    { division: null, name: "Scientific thought / engineering goals", description: "Problem, hypothesis or design goals; methodology; data and analysis; conclusions.", maxScore: 30 },
    { division: null, name: "Creativity and innovation", description: "Originality of the idea, approach and solution.", maxScore: 20 },
    { division: null, name: "Oral presentation", description: "Explanation of the project and response to judges' questions.", maxScore: 20 },
    { division: null, name: "Display / exhibit", description: "Quality and relevance of the exhibit and display board.", maxScore: 10 },
  ],
};

/**
 * Kenya's 47 counties grouped into the 8 KSEF regions (the former
 * provinces) - a project's regional-level competition unit.
 */
const REGION_COUNTIES: Record<string, string[]> = {
  Coast: ["Mombasa", "Kwale", "Kilifi", "Tana River", "Lamu", "Taita Taveta"],
  "North Eastern": ["Garissa", "Wajir", "Mandera"],
  Eastern: ["Marsabit", "Isiolo", "Meru", "Tharaka-Nithi", "Embu", "Kitui", "Machakos", "Makueni"],
  Central: ["Nyandarua", "Nyeri", "Kirinyaga", "Murang'a", "Kiambu"],
  "Rift Valley": [
    "Turkana", "West Pokot", "Samburu", "Trans Nzoia", "Uasin Gishu", "Elgeyo-Marakwet", "Nandi",
    "Baringo", "Laikipia", "Nakuru", "Narok", "Kajiado", "Kericho", "Bomet",
  ],
  Western: ["Kakamega", "Vihiga", "Bungoma", "Busia"],
  Nyanza: ["Siaya", "Kisumu", "Homa Bay", "Migori", "Kisii", "Nyamira"],
  Nairobi: ["Nairobi"],
};

export function regionForCounty(county: string): string {
  const normalized = county.trim().toLowerCase();
  for (const [region, counties] of Object.entries(REGION_COUNTIES)) {
    if (counties.some((c) => c.toLowerCase() === normalized)) return region;
  }
  return "Unknown";
}

/**
 * The geographic unit a project competes within at a level: its own
 * sub-county at Sub-County level, its county at County level, its region at
 * Regional level, and everyone together at National level.
 */
export function competitionUnit(level: Level, school: { subcounty: string; county: string; region: string }): string {
  switch (level) {
    case "SUB_COUNTY":
    case "ZONE":
    case "BASE":
      return `${school.subcounty}, ${school.county}`;
    case "COUNTY":
      return school.county;
    case "REGIONAL":
      return school.region;
    default:
      return "National";
  }
}

/** The level after `level` in this edition's ladder, or null at the top. */
export function nextKsefLevel(levels: readonly Level[], level: Level): Level | null {
  const index = levels.indexOf(level);
  return index >= 0 && index < levels.length - 1 ? (levels[index + 1] ?? null) : null;
}

export interface RankableResult {
  id: string;
  unit: string;
  categoryId: string;
  totalScore: number | null;
}

/**
 * Ranks results within each (geographic unit, category) group by total
 * score, highest first. Equal scores share a rank (the next rank is
 * skipped). Unscored results get no rank.
 */
export function rankKsefResults(results: readonly RankableResult[]): Map<string, number> {
  const groups = new Map<string, RankableResult[]>();
  for (const r of results) {
    if (r.totalScore === null) continue;
    const key = `${r.unit}\u0000${r.categoryId}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const ranks = new Map<string, number>();
  for (const group of Array.from(groups.values())) {
    group.sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0));
    group.forEach((r, index) => {
      const previous = group[index - 1];
      ranks.set(r.id, previous && previous.totalScore === r.totalScore ? ranks.get(previous.id)! : index + 1);
    });
  }
  return ranks;
}

/** Average of the judges' submitted totals, to 2 decimals; null if no judge has submitted. */
export function averageJudgeTotal(judgeTotals: readonly number[]): number | null {
  if (judgeTotals.length === 0) return null;
  const average = judgeTotals.reduce((sum, t) => sum + t, 0) / judgeTotals.length;
  return Math.round(average * 100) / 100;
}
