import { describe, it, expect } from "vitest";
import { KSEF_JUNIOR_SCORE_SHEET, STANDARD_KSEF_STRUCTURE, isLevelScore, levelScores } from "@/lib/ksef-config";

const totalFor = (prefix: string) =>
  KSEF_JUNIOR_SCORE_SHEET.filter((c) => c.section?.startsWith(prefix)).reduce((sum, c) => sum + c.maxScore, 0);

describe("official KSEF Junior School score sheet", () => {
  it("matches the printed totals: Part A /20, Part B /10, Part C /35 - 65 in all", () => {
    expect(totalFor("Part A")).toBe(20);
    expect(totalFor("Part B")).toBe(10);
    expect(totalFor("Part C")).toBe(35);
    expect(KSEF_JUNIOR_SCORE_SHEET.reduce((sum, c) => sum + c.maxScore, 0)).toBe(65);
  });

  it("has every criterion from the sheets (14 + 8 + 15, with logical sequence split in three)", () => {
    expect(KSEF_JUNIOR_SCORE_SHEET.filter((c) => c.section?.startsWith("Part A"))).toHaveLength(14);
    expect(KSEF_JUNIOR_SCORE_SHEET.filter((c) => c.section?.startsWith("Part B"))).toHaveLength(8);
    expect(KSEF_JUNIOR_SCORE_SHEET.filter((c) => c.section?.startsWith("Part C"))).toHaveLength(15);
  });

  it("is Junior School only and scored by level", () => {
    expect(KSEF_JUNIOR_SCORE_SHEET.every((c) => c.division === "JUNIOR_SCHOOL" && c.levelScored)).toBe(true);
  });

  it("is what a new edition starts from for Junior School", () => {
    const junior = STANDARD_KSEF_STRUCTURE.criteria.filter((c) => c.division === "JUNIOR_SCHOOL" || c.division === null);
    expect(junior.reduce((sum, c) => sum + c.maxScore, 0)).toBe(65);
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
