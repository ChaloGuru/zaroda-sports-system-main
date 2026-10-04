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
  /** Score-sheet heading; criteria with the same section are grouped and subtotalled. */
  section?: string | null;
  /** Scored by BE/AE/ME/EE level rather than any number up to maxScore. */
  levelScored?: boolean;
}

/**
 * Performance levels on the official KSEF score sheets. A criterion scored by
 * level earns this fraction of its maximum - e.g. out of 2: BE 0.5, AE 1,
 * ME 1.5, EE 2.
 */
export const KSEF_SCORE_LEVELS = [
  { code: "BE", label: "Below Expectation", fraction: 0.25 },
  { code: "AE", label: "Approaching Expectation", fraction: 0.5 },
  { code: "ME", label: "Meeting Expectation", fraction: 0.75 },
  { code: "EE", label: "Exceeding Expectation", fraction: 1 },
] as const;

/** The score each level gives for a criterion out of `maxScore`. */
export function levelScores(maxScore: number): { code: string; label: string; score: number }[] {
  return KSEF_SCORE_LEVELS.map((l) => ({ code: l.code, label: l.label, score: Math.round(maxScore * l.fraction * 100) / 100 }));
}

/** True if `score` is exactly one of the level scores for a criterion out of `maxScore`. */
export function isLevelScore(maxScore: number, score: number): boolean {
  return levelScores(maxScore).some((l) => Math.abs(l.score - score) < 1e-9);
}

const PART_A = "Part A: Written Communication (Write-up and Posters) - Session One";
const PART_B = "Part B: Oral Communication (Interaction) - Session Two";
const PART_C = "Part C: Scientific Thought, Method and Creativity - Session Two";

type SheetRow = readonly [section: string, name: string, description: string, maxScore: number];

function officialSheet(division: KsefDivision, rows: readonly SheetRow[]): StandardKsefCriterion[] {
  return rows.map(([section, name, description, maxScore]) => ({ division, section, name, description, maxScore, levelScored: true }));
}

// Descriptions follow the printed sheets; "Guide:" notes are from the KSEF
// scoring guide (2019, updated 2020).
const A = {
  neat: [PART_A, "Write-up neatly and logically organized", "Written with clearly labelled sections, e.g. abstract and plagiarism pledge.", 2],
  research: [PART_A, "Evidence of background research in write-up", "Background information and knowledge summarized in the write-up, with articles in an appendix.", 1],
  language: (max: number) => [PART_A, "Written language in write-up or on display board", "Legible, correct fonts, scientific, suitable headings, no spelling mistakes.", max] as const,
  methods: [PART_A, "Methods (and materials) or technologies used, in write-up and on display board", "Presented in logical order, correct expression; more extensive in the report than on the poster. Guide: without a method, results and data can't earn marks.", 2],
  results: [PART_A, "Results in write-up and on display board", "Full observations presented in tabular form and in graphs in the write-up; summary in graph or diagram form on the poster. Results should be scientifically and mathematically suitable and correct.", 2],
  analysis: (max: number) => [PART_A, "Analysis of results in write-up or on display board", "Report, findings and graphs explained in words - more extensive in the write-up than on the poster.", max] as const,
  discussion: (max: number) => [PART_A, "Discussion of results in write-up or on display board", "Patterns and trends are noted and explained, anomalies/unusual results are discussed, limitations noted and clarified.", max] as const,
  future: (max: number) => [PART_A, "Future possibilities of research in write-up / recommendations", "Future extensions and possibilities are identified.", max] as const,
  conclusions: (max: number) => [PART_A, "Conclusions reflected in write-up or on display board", "They are valid, based on findings and linked to objectives.", max] as const,
  references: (max: number) => [PART_A, "References in write-up", "References to books, magazines and internet addresses given in the correct (APA) format. Guide: an error in a reference loses the marks.", max] as const,
  acknowledgements: (max: number) => [PART_A, "Acknowledgements in write-up or on display board", "Find out the depth of adult assistance received and how this assistance has been used.", max] as const,
  display: [PART_A, "Display board summarises the project and is neatly organized", "Includes the correct size of board and a logical flow of presentation.", 2],
  portfolio: [PART_A, "Project data file / portfolio", "Research plan, rough work, original data sheets, plans, diagrams, photos, questionnaires, previous models, emails, etc. - showing what was done and when, where and how observations were made, circumstances, results, etc.", 2],
} as const;

const B = {
  enthusiasm: [PART_B, "Enthusiasm / effort", "A worthwhile effort was made to explain, lots of enthusiasm.", 1],
  voice: [PART_B, "Voice / tone", "Totally audible, varying intonation.", 1],
  confidence: [PART_B, "Self-confidence", "Ease of presentation.", 1],
  language: (max: number) => [PART_B, "Scientific language", "Use of appropriate language and vocabulary.", max] as const,
  questions: [PART_B, "Response to questions", "Carefully listens to questions, responds clearly and intelligently.", 2],
  limitations: (max: number) => [PART_B, "Limitations / weaknesses and gaps", "The learner is fully aware of limitations and can explain reasons for gaps.", max] as const,
  suggestions: (max: number) => [PART_B, "Possible suggestions for expanding the project / recommendations", "The learner is fully aware of possibilities for expanding the project.", max] as const,
  authenticity: (max: number) => [PART_B, "Authenticity", "The learner takes complete ownership of the project and integrates assistance received in their answers to questions; can demonstrate all of the methods/techniques used. Ask questions to find out the amount of assistance received and how it has been used.", max] as const,
} as const;

// Part C is the same on the Junior and Senior School sheets.
const PART_C_ROWS: readonly SheetRow[] = [
  [PART_C, "Statement of the problem", "Clear statement of the problem and objectives.", 2],
  [PART_C, "Introduction / background information", "Relationship between the project and other research done in the same area.", 2],
  [PART_C, "Application of scientific concepts to everyday life", "Guide: the higher levels need the project to work - not working, partially working, fully working.", 3],
  [PART_C, "Subject mastery", "Demonstration of deep and accurate knowledge of the scientific and engineering principles involved.", 3],
  [PART_C, "Literature review", "Project shows understanding of existing knowledge.", 2],
  [PART_C, "Data", "Adequate data obtained to verify conclusions.", 3],
  [PART_C, "Variables", "Variables/parameters were clearly defined and recognized, controls used. Guide: merely listing variables earns little - marks are for showing the effect of changing them.", 2],
  [PART_C, "Statement of originality", "What inspired the learner to come up with the project.", 2],
  [PART_C, "Logical sequence - apparatus / requirements", "Experimental design demonstrates understanding of scientific methods of research. Guide: list equipment, tools, software and versions with specifications.", 2],
  [PART_C, "Logical sequence - procedure / method", "Experimental design demonstrates understanding of scientific methods of research. Guide: without apparatus/requirements, the procedure can't earn marks.", 2],
  [PART_C, "Logical sequence - correct illustrations", "Experimental design demonstrates understanding of scientific methods of research. Guide: exhibit not working, partially working, or fully working.", 3],
  [PART_C, "Linkage to emerging issues", "Links the innovation with emerging issues or adds value to the existing body of knowledge.", 2],
  [PART_C, "Originality", "Is the problem original, or does the approach to it show originality? Does the construction or design of equipment/project show originality? Guide: little imagination, modified, or new/novel.", 3],
  [PART_C, "Creativity", "Have materials/equipment been used in an ingenious way? To what extent does the project/exhibit represent the learner's own effort/skill?", 2],
  [PART_C, "Skill", "Was the workmanship of the display skilful? Workmanship is neat and well done; the project requires minimum maintenance.", 2],
];

/**
 * The official KSEF Junior School score sheet: Part A /20, Part B /10,
 * Part C /35 - 65 in all, every criterion scored BE/AE/ME/EE.
 */
export const KSEF_JUNIOR_SCORE_SHEET = officialSheet("JUNIOR_SCHOOL", [
  A.neat,
  A.research,
  A.language(1),
  [PART_A, "Objectives of project reflected in write-up and on display board", "", 2],
  A.methods,
  A.results,
  A.analysis(1),
  A.discussion(1),
  A.future(1),
  A.conclusions(1),
  A.references(1),
  A.acknowledgements(1),
  A.display,
  A.portfolio,
  B.enthusiasm,
  B.voice,
  B.confidence,
  B.language(2),
  B.questions,
  B.limitations(1),
  B.suggestions(1),
  B.authenticity(1),
  ...PART_C_ROWS,
]);

/**
 * The KSEF Senior (secondary) School score sheet, 2019 version updated 2020:
 * Part A /30, Part B /15, Part C /35 - 80 in all, scored BE/AE/ME/EE.
 * Confirm the current version with the sub-county / regional coordinator.
 */
export const KSEF_SENIOR_SCORE_SHEET = officialSheet("SENIOR_SCHOOL", [
  A.neat,
  A.research,
  [PART_A, "Introduction in write-up", "Focus question / problem statement.", 1],
  A.language(2),
  [PART_A, "Aim / hypothesis / objectives reflected in write-up and on display board", "", 2],
  A.methods,
  [PART_A, "Variables identified", "Dependent and independent variables identified.", 2],
  A.results,
  A.analysis(2),
  A.discussion(2),
  A.future(2),
  A.conclusions(2),
  A.references(2),
  A.acknowledgements(2),
  A.display,
  A.portfolio,
  [PART_B, "Capture of interest", "The presentation captures the judge's interest.", 1],
  B.enthusiasm,
  B.voice,
  B.confidence,
  B.language(1),
  B.questions,
  [PART_B, "Presentation of project", "Presented logically, explained rather than recited.", 2],
  B.limitations(2),
  B.suggestions(2),
  B.authenticity(2),
  ...PART_C_ROWS,
]);

/** The official score sheet for each school level. */
export const KSEF_OFFICIAL_SCORE_SHEETS: Record<KsefDivision, StandardKsefCriterion[]> = {
  JUNIOR_SCHOOL: KSEF_JUNIOR_SCORE_SHEET,
  SENIOR_SCHOOL: KSEF_SENIOR_SCORE_SHEET,
};

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
    ...KSEF_JUNIOR_SCORE_SHEET,
    ...KSEF_SENIOR_SCORE_SHEET,
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

export interface DiscrepancyCheck {
  /** Highest minus lowest submitted judge total. */
  spread: number;
  /** The threshold converted to marks for this score sheet. */
  thresholdMarks: number;
  exceeds: boolean;
}

/**
 * Compares judges' submitted totals for one project. Needs at least two
 * sheets; flags when the spread is strictly greater than the threshold. The
 * threshold is whatever the administrator configured for the edition -
 * either marks, or a percentage of the score sheet's maximum total.
 */
export function checkJudgeDiscrepancy(
  judgeTotals: readonly number[],
  config: { threshold: number; basis: "POINTS" | "PERCENT"; maxTotal: number },
): DiscrepancyCheck | null {
  if (judgeTotals.length < 2) return null;
  const spread = Math.round((Math.max(...judgeTotals) - Math.min(...judgeTotals)) * 100) / 100;
  const thresholdMarks =
    config.basis === "PERCENT" ? Math.round(((config.maxTotal * config.threshold) / 100) * 100) / 100 : config.threshold;
  return { spread, thresholdMarks, exceeds: spread > thresholdMarks };
}

export const KSEF_PANEL_ROLE_LABELS = {
  JUDGE: "Judge",
  CHIEF_JUDGE: "Chief Judge",
  SRC_MEMBER: "SRC Member",
} as const;

/**
 * Only panel members with the Judge role score projects. Chief Judges review
 * judging discrepancies (and mustn't be judging the projects they review) and
 * SRC members handle complaints, so neither is given projects.
 */
export const ASSIGNABLE_PANEL_ROLE = "JUDGE" as const;

export interface AutoAssignProject {
  id: string;
  /** Judges already assigned to this project at this level. */
  judgeIds: readonly string[];
}

export interface AutoAssignJudge {
  id: string;
  /** Projects this judge already has at this level. */
  load: number;
}

export interface AutoAssignPlan {
  assignments: { judgeId: string; projectId: string }[];
  /** Projects that couldn't reach `judgesPerProject` - not enough distinct judges. */
  shortfall: { projectId: string; missing: number }[];
}

/**
 * Tops each project up to `judgesPerProject` judges, keeping existing
 * assignments and never giving a project the same judge twice. Projects with
 * the fewest judges go first, and each place goes to the least-loaded judge
 * (ties broken by the judges' order), so work is spread as evenly as possible.
 */
export function planAutoAssignments(
  projects: readonly AutoAssignProject[],
  judges: readonly AutoAssignJudge[],
  judgesPerProject: number,
): AutoAssignPlan {
  const load = new Map(judges.map((j) => [j.id, j.load]));
  const order = new Map(judges.map((j, i) => [j.id, i]));
  const plan: AutoAssignPlan = { assignments: [], shortfall: [] };

  const queue = projects
    .map((p, i) => ({ ...p, i }))
    .sort((a, b) => a.judgeIds.length - b.judgeIds.length || a.i - b.i);
  for (const project of queue) {
    const missing = judgesPerProject - project.judgeIds.length;
    if (missing <= 0) continue;
    const already = new Set(project.judgeIds);
    const picks = judges
      .map((j) => j.id)
      .filter((id) => !already.has(id))
      .sort((a, b) => load.get(a)! - load.get(b)! || order.get(a)! - order.get(b)!)
      .slice(0, missing);
    for (const judgeId of picks) {
      plan.assignments.push({ judgeId, projectId: project.id });
      load.set(judgeId, load.get(judgeId)! + 1);
    }
    if (picks.length < missing) plan.shortfall.push({ projectId: project.id, missing: missing - picks.length });
  }
  return plan;
}
