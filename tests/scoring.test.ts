import { describe, it, expect } from "vitest";
import {
  parseTimeToSeconds,
  formatSecondsToTime,
  assignNextBibNumber,
  validateBibRangeNoOverlap,
  seedLanes,
  DEFAULT_LANE_PRIORITY,
  computeStandings,
  pointsForPosition,
  computeSchoolLevelStandings,
  type MatchResult,
} from "@/lib/scoring";

describe("parseTimeToSeconds", () => {
  it("parses plain seconds", () => {
    expect(parseTimeToSeconds("12.06")).toBeCloseTo(12.06);
  });

  it("parses 0:ss.cc", () => {
    expect(parseTimeToSeconds("0:12.06")).toBeCloseTo(12.06);
  });

  it("parses m:ss.cc", () => {
    expect(parseTimeToSeconds("1:23.45")).toBeCloseTo(83.45);
  });

  it("parses integer seconds with no decimal", () => {
    expect(parseTimeToSeconds("45")).toBe(45);
  });

  it("throws on malformed input", () => {
    expect(() => parseTimeToSeconds("not-a-time")).toThrow();
    expect(() => parseTimeToSeconds("1:2:3")).toThrow();
  });
});

describe("formatSecondsToTime", () => {
  it("formats sub-minute times with a 0 minute prefix", () => {
    expect(formatSecondsToTime(12.06)).toBe("0:12.06");
  });

  it("formats multi-minute times", () => {
    expect(formatSecondsToTime(83.45)).toBe("1:23.45");
  });

  it("pads single-digit seconds", () => {
    expect(formatSecondsToTime(69.06)).toBe("1:09.06");
  });

  it("round-trips through parseTimeToSeconds", () => {
    const original = "3:45.12";
    const seconds = parseTimeToSeconds(original);
    expect(formatSecondsToTime(seconds)).toBe(original);
  });

  it("throws on negative values", () => {
    expect(() => formatSecondsToTime(-1)).toThrow();
  });
});

describe("assignNextBibNumber", () => {
  const range = { schoolId: "school-a", rangeStart: 100, rangeEnd: 103 };

  it("assigns the range start when no bibs are used yet", () => {
    expect(assignNextBibNumber("school-a", range, [])).toBe(100);
  });

  it("assigns the next sequential number after the highest used", () => {
    expect(assignNextBibNumber("school-a", range, [100, 101])).toBe(102);
  });

  it("throws when no range is allocated for the school", () => {
    expect(() => assignNextBibNumber("school-b", undefined, [])).toThrow(/No bib range allocated/);
  });

  it("throws when the range is exhausted", () => {
    expect(() => assignNextBibNumber("school-a", range, [100, 101, 102, 103])).toThrow(/exhausted/);
  });

  it("throws on an invalid range (start > end)", () => {
    expect(() => assignNextBibNumber("school-a", { schoolId: "school-a", rangeStart: 10, rangeEnd: 5 }, [])).toThrow();
  });
});

describe("validateBibRangeNoOverlap", () => {
  const existing = [
    { schoolId: "school-a", rangeStart: 100, rangeEnd: 149 },
    { schoolId: "school-b", rangeStart: 200, rangeEnd: 249 },
  ];

  it("allows a non-overlapping range", () => {
    expect(() =>
      validateBibRangeNoOverlap({ schoolId: "school-c", rangeStart: 150, rangeEnd: 199 }, existing),
    ).not.toThrow();
  });

  it("rejects a range that partially overlaps another school", () => {
    expect(() =>
      validateBibRangeNoOverlap({ schoolId: "school-c", rangeStart: 140, rangeEnd: 160 }, existing),
    ).toThrow(/overlaps/);
  });

  it("rejects a range fully contained inside another school's range", () => {
    expect(() =>
      validateBibRangeNoOverlap({ schoolId: "school-c", rangeStart: 110, rangeEnd: 120 }, existing),
    ).toThrow(/overlaps/);
  });

  it("allows re-saving the same school's own range (excluded from the overlap check)", () => {
    const others = existing.filter((r) => r.schoolId !== "school-a");
    expect(() =>
      validateBibRangeNoOverlap({ schoolId: "school-a", rangeStart: 100, rangeEnd: 160 }, others),
    ).not.toThrow();
  });

  it("rejects rangeStart > rangeEnd", () => {
    expect(() => validateBibRangeNoOverlap({ schoolId: "school-c", rangeStart: 50, rangeEnd: 10 }, [])).toThrow();
  });
});

describe("seedLanes", () => {
  it("seeds the fastest personal best into the first lane priority slot", () => {
    const result = seedLanes([
      { participantId: "slow", personalBest: 13.2 },
      { participantId: "fast", personalBest: 10.5 },
      { participantId: "mid", personalBest: 11.8 },
    ]);
    expect(result.find((r) => r.participantId === "fast")?.laneNumber).toBe(DEFAULT_LANE_PRIORITY[0]);
    expect(result.find((r) => r.participantId === "mid")?.laneNumber).toBe(DEFAULT_LANE_PRIORITY[1]);
    expect(result.find((r) => r.participantId === "slow")?.laneNumber).toBe(DEFAULT_LANE_PRIORITY[2]);
  });

  it("seeds participants without a personal best last", () => {
    const result = seedLanes([
      { participantId: "unknown", personalBest: null },
      { participantId: "known", personalBest: 12.0 },
    ]);
    expect(result[0]?.participantId).toBe("known");
    expect(result[1]?.participantId).toBe("unknown");
  });
});

describe("computeStandings", () => {
  it("computes football standings with win/draw/loss points", () => {
    const results: MatchResult[] = [
      { teamAId: "A", teamBId: "B", teamAScore: 2, teamBScore: 1 },
      { teamAId: "A", teamBId: "C", teamAScore: 1, teamBScore: 1 },
      { teamAId: "B", teamBId: "C", teamAScore: 0, teamBScore: 3 },
    ];
    const standings = computeStandings(["A", "B", "C"], results, "FOOTBALL");

    const a = standings.find((s) => s.teamId === "A")!;
    expect(a.points).toBe(4); // 1 win (3) + 1 draw (1)
    expect(a.played).toBe(2);
    expect(a.gf).toBe(3);
    expect(a.ga).toBe(2);

    const c = standings.find((s) => s.teamId === "C")!;
    expect(c.points).toBe(4); // 1 draw (1) + 1 win (3)
  });

  it("does not award draw points in a no-draw sport (basketball) on a tied scoreline", () => {
    const results: MatchResult[] = [{ teamAId: "A", teamBId: "B", teamAScore: 80, teamBScore: 80 }];
    const standings = computeStandings(["A", "B"], results, "BASKETBALL");
    expect(standings.every((s) => s.points === 0)).toBe(true);
    expect(standings.every((s) => s.drawn === 1)).toBe(true);
  });

  it("applies basketball's loss-point rule (1 point for a loss)", () => {
    const results: MatchResult[] = [{ teamAId: "A", teamBId: "B", teamAScore: 90, teamBScore: 85 }];
    const standings = computeStandings(["A", "B"], results, "BASKETBALL");
    expect(standings.find((s) => s.teamId === "A")?.points).toBe(2);
    expect(standings.find((s) => s.teamId === "B")?.points).toBe(1);
  });

  it("breaks ties by head-to-head points before goal difference", () => {
    // A and B both finish level on points; A beat B head-to-head, so A ranks above
    // B even though B has a better overall goal difference against weaker teams.
    const results: MatchResult[] = [
      { teamAId: "A", teamBId: "B", teamAScore: 1, teamBScore: 0 },
      { teamAId: "B", teamBId: "C", teamAScore: 5, teamBScore: 0 },
      { teamAId: "A", teamBId: "C", teamAScore: 0, teamBScore: 1 },
      { teamAId: "C", teamBId: "B", teamAScore: 0, teamBScore: 1 },
    ];
    const standings = computeStandings(["A", "B", "C"], results, "FOOTBALL");
    const a = standings.find((s) => s.teamId === "A")!;
    const b = standings.find((s) => s.teamId === "B")!;
    expect(a.points).toBe(b.points);
    expect(standings.indexOf(a)).toBeLessThan(standings.indexOf(b));
  });

  it("falls back to goal difference when there is no head-to-head result between tied teams", () => {
    const results: MatchResult[] = [
      { teamAId: "A", teamBId: "X", teamAScore: 5, teamBScore: 0 },
      { teamAId: "B", teamBId: "Y", teamAScore: 1, teamBScore: 0 },
    ];
    const standings = computeStandings(["A", "B"], results, "FOOTBALL");
    const a = standings.find((s) => s.teamId === "A")!;
    const b = standings.find((s) => s.teamId === "B")!;
    expect(a.points).toBe(b.points);
    expect(a.gd).toBeGreaterThan(b.gd);
    expect(standings.indexOf(a)).toBeLessThan(standings.indexOf(b));
  });

  it("uses fair play score as the final tie-breaker", () => {
    const results: MatchResult[] = [
      {
        teamAId: "A",
        teamBId: "X",
        teamAScore: 2,
        teamBScore: 0,
        teamACards: { yellow: 2, red: 0 },
      },
      { teamAId: "B", teamBId: "Y", teamAScore: 2, teamBScore: 0 },
    ];
    const standings = computeStandings(["A", "B"], results, "FOOTBALL");
    const a = standings.find((s) => s.teamId === "A")!;
    const b = standings.find((s) => s.teamId === "B")!;
    expect(a.points).toBe(b.points);
    expect(a.gd).toBe(b.gd);
    expect(a.fairPlay).toBeLessThan(b.fairPlay);
    expect(standings.indexOf(b)).toBeLessThan(standings.indexOf(a));
  });

  it("applies rugby's win/draw point scale", () => {
    const results: MatchResult[] = [{ teamAId: "A", teamBId: "B", teamAScore: 10, teamBScore: 10 }];
    const standings = computeStandings(["A", "B"], results, "RUGBY");
    expect(standings.every((s) => s.points === 2)).toBe(true);
  });
});

describe("pointsForPosition", () => {
  it("maps 1st-6th to the 7/5/4/3/2/1 scale", () => {
    expect(pointsForPosition(1)).toBe(7);
    expect(pointsForPosition(2)).toBe(5);
    expect(pointsForPosition(3)).toBe(4);
    expect(pointsForPosition(4)).toBe(3);
    expect(pointsForPosition(5)).toBe(2);
    expect(pointsForPosition(6)).toBe(1);
  });

  it("scores 0 for positions outside the top 6", () => {
    expect(pointsForPosition(7)).toBe(0);
    expect(pointsForPosition(100)).toBe(0);
  });
});

describe("computeSchoolLevelStandings", () => {
  it("credits a normal placing to only its own school-level table and to overall once", () => {
    const standings = computeSchoolLevelStandings([
      { schoolId: "school-a", position: 1, schoolLevel: "SECONDARY" },
    ]);
    expect(standings.SECONDARY.get("school-a")).toBe(7);
    expect(standings.PRIMARY.get("school-a")).toBeUndefined();
    expect(standings.OVERALL.get("school-a")).toBe(7);
  });

  it("credits a primary_junior placing to both Primary and Junior Secondary, but only once to Overall", () => {
    const standings = computeSchoolLevelStandings([
      { schoolId: "school-a", position: 2, schoolLevel: "PRIMARY", isPrimaryJunior: true },
    ]);
    expect(standings.PRIMARY.get("school-a")).toBe(5);
    expect(standings.JUNIOR_SECONDARY.get("school-a")).toBe(5);
    expect(standings.SECONDARY.get("school-a")).toBeUndefined();
    // Not double-counted: overall reflects the single placing's points once, not 5+5.
    expect(standings.OVERALL.get("school-a")).toBe(5);
  });

  it("accumulates points across multiple placings for the same school", () => {
    const standings = computeSchoolLevelStandings([
      { schoolId: "school-a", position: 1, schoolLevel: "SECONDARY" },
      { schoolId: "school-a", position: 3, schoolLevel: "SECONDARY" },
    ]);
    expect(standings.SECONDARY.get("school-a")).toBe(7 + 4);
    expect(standings.OVERALL.get("school-a")).toBe(7 + 4);
  });

  it("ignores placings outside the scoring positions", () => {
    const standings = computeSchoolLevelStandings([{ schoolId: "school-a", position: 8, schoolLevel: "SECONDARY" }]);
    expect(standings.OVERALL.has("school-a")).toBe(false);
  });
});
