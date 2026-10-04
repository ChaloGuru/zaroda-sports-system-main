import { describe, it, expect } from "vitest";
import {
  KSEF_JUNIOR_SCORE_SHEET,
  KSEF_SENIOR_SCORE_SHEET,
  STANDARD_KSEF_STRUCTURE,
  isLevelScore,
  levelScores,
  type StandardKsefCriterion,
} from "@/lib/ksef-config";

const part = (sheet: StandardKsefCriterion[], prefix: string) => sheet.filter((c) => c.section?.startsWith(prefix));
const total = (rows: StandardKsefCriterion[]) => rows.reduce((sum, c) => sum + c.maxScore, 0);

describe.each([
  { name: "Junior School", sheet: KSEF_JUNIOR_SCORE_SHEET, division: "JUNIOR_SCHOOL", a: [14, 20], b: [8, 10], c: [15, 35], all: 65 },
  { name: "Senior School", sheet: KSEF_SENIOR_SCORE_SHEET, division: "SENIOR_SCHOOL", a: [16, 30], b: [10, 15], c: [15, 35], all: 80 },
])("official KSEF $name score sheet", ({ sheet, division, a, b, c, all }) => {
  it(`has Part A /${a[1]}, Part B /${b[1]}, Part C /${c[1]} - ${all} in all`, () => {
    expect([part(sheet, "Part A").length, total(part(sheet, "Part A"))]).toEqual(a);
    expect([part(sheet, "Part B").length, total(part(sheet, "Part B"))]).toEqual(b);
    expect([part(sheet, "Part C").length, total(part(sheet, "Part C"))]).toEqual(c);
    expect(total(sheet)).toBe(all);
  });

  it("is for its own school level only and scored by level", () => {
    expect(sheet.every((row) => row.division === division && row.levelScored)).toBe(true);
  });

  it("is what a new edition starts from for that school level", () => {
    expect(total(STANDARD_KSEF_STRUCTURE.criteria.filter((row) => row.division === division || row.division === null))).toBe(all);
  });
});

describe("Junior vs Senior differences (from the comparison sheet)", () => {
  const max = (sheet: StandardKsefCriterion[], name: string) => sheet.find((c) => c.name.startsWith(name))?.maxScore;

  it("Senior-only criteria exist only on the Senior sheet", () => {
    for (const name of ["Introduction in write-up", "Variables identified", "Capture of interest", "Presentation of project"]) {
      expect(max(KSEF_SENIOR_SCORE_SHEET, name)).toBeDefined();
      expect(max(KSEF_JUNIOR_SCORE_SHEET, name)).toBeUndefined();
    }
  });

  it("Junior gives scientific language more marks than Senior", () => {
    expect(max(KSEF_JUNIOR_SCORE_SHEET, "Scientific language")).toBe(2);
    expect(max(KSEF_SENIOR_SCORE_SHEET, "Scientific language")).toBe(1);
  });

  it("Part C is identical on both sheets", () => {
    const partC = (sheet: StandardKsefCriterion[]) => part(sheet, "Part C").map((row) => [row.name, row.maxScore]);
    expect(partC(KSEF_SENIOR_SCORE_SHEET)).toEqual(partC(KSEF_JUNIOR_SCORE_SHEET));
  });
});

describe("BE / AE / ME / EE levels", () => {
  it("give the marks printed on the sheets", () => {
    expect(levelScores(1).map((l) => l.score)).toEqual([0.25, 0.5, 0.75, 1]);
    expect(levelScores(2).map((l) => l.score)).toEqual([0.5, 1, 1.5, 2]);
    expect(levelScores(3).map((l) => l.score)).toEqual([0.75, 1.5, 2.25, 3]);
    expect(levelScores(2).map((l) => l.code)).toEqual(["BE", "AE", "ME", "EE"]);
  });

  it("only accept those exact marks", () => {
    expect(isLevelScore(3, 2.25)).toBe(true);
    expect(isLevelScore(3, 2)).toBe(false);
    expect(isLevelScore(2, 0)).toBe(false);
  });
});
