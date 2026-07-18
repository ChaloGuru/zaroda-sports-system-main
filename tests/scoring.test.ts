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
  generateRoundRobinSchedule,
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
    // A and B finish level on points; A beat B head-to-head but has a worse
    // overall goal difference than B (each padded a win against a separate
    // weaker opponent). Head-to-head must still rank A above B, ahead of GD.
    const results: MatchResult[] = [
      { teamAId: "A", teamBId: "B", teamAScore: 1, teamBScore: 0 },
      { teamAId: "A", teamBId: "X", teamAScore: 0, teamBScore: 2 },
      { teamAId: "B", teamBId: "Y", teamAScore: 2, teamBScore: 0 },
    ];
    const standings = computeStandings(["A", "B", "X", "Y"], results, "FOOTBALL");
    const a = standings.find((s) => s.teamId === "A")!;
    const b = standings.find((s) => s.teamId === "B")!;
    expect(a.points).toBe(b.points);
    expect(a.gd).toBeLessThan(b.gd);
    expect(standings.indexOf(a)).toBeLessThan(standings.indexOf(b));
  });

  it("falls back to goal difference when there is no head-to-head result between tied teams", () => {
    const results: MatchResult[] = [
      { teamAId: "A", teamBId: "X", teamAScore: 5, teamBScore: 0 },
      { teamAId: "B", teamBId: "Y", teamAScore: 1, teamBScore: 0 },
    ];
    const standings = computeStandings(["A", "B", "X", "Y"], results, "FOOTBALL");
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
    const standings = computeStandings(["A", "B", "X", "Y"], results, "FOOTBALL");
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

  it("allows chess team matches to draw (board points can split evenly)", () => {
    const results: MatchResult[] = [{ teamAId: "A", teamBId: "B", teamAScore: 2, teamBScore: 2 }];
    const standings = computeStandings(["A", "B"], results, "CHESS");
    expect(standings.every((s) => s.points === 1)).toBe(true);
  });

  it.each(["TABLE_TENNIS", "BADMINTON"] as const)("%s has no draws - a tied scoreline awards no points", (sport) => {
    const results: MatchResult[] = [{ teamAId: "A", teamBId: "B", teamAScore: 3, teamBScore: 3 }];
    const standings = computeStandings(["A", "B"], results, sport);
    expect(standings.every((s) => s.points === 0)).toBe(true);
  });

  it("awards the present team a win with no goals for a walkover, and excludes a team that only ever defaulted", () => {
    // A never plays a real match against anyone - both its fixtures are walkovers, so it never actually
    // competed in this game and shouldn't appear ranked (the Nyatike West scenario).
    const standings = computeStandings(
      ["A", "B", "C"],
      [],
      "FOOTBALL",
      [
        { teamAId: "A", teamBId: "B", winnerId: "B" },
        { teamAId: "A", teamBId: "C", winnerId: "C" },
      ],
    );
    expect(standings.map((s) => s.teamId).sort()).toEqual(["B", "C"]);
    const b = standings.find((s) => s.teamId === "B")!;
    expect(b).toMatchObject({ played: 1, won: 1, lost: 0, gf: 0, ga: 0, points: 3 });
  });

  it("charges a defaulting team a loss (not exclusion) if it has at least one real match in the same standings scope", () => {
    const standings = computeStandings(
      ["A", "B", "C"],
      [{ teamAId: "A", teamBId: "C", teamAScore: 1, teamBScore: 0 }],
      "FOOTBALL",
      [{ teamAId: "A", teamBId: "B", winnerId: "B" }],
    );
    expect(standings.map((s) => s.teamId).sort()).toEqual(["A", "B", "C"]);
    const a = standings.find((s) => s.teamId === "A")!;
    expect(a).toMatchObject({ played: 2, won: 1, lost: 1, gf: 1, ga: 0, points: 3 });
    const b = standings.find((s) => s.teamId === "B")!;
    expect(b).toMatchObject({ played: 1, won: 1, lost: 0, gf: 0, ga: 0, points: 3 });
  });
});

function allPairs(teamIds: string[]): Set<string> {
  const pairs = new Set<string>();
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      pairs.add([teamIds[i], teamIds[j]].sort().join("-"));
    }
  }
  return pairs;
}

describe("generateRoundRobinSchedule", () => {
  it("schedules every pair exactly once for an even team count, with no byes", () => {
    const teams = ["A", "B", "C", "D"];
    const rounds = generateRoundRobinSchedule(teams);

    expect(rounds).toHaveLength(3); // n - 1 rounds
    expect(rounds.every((r) => r.byeTeamId === undefined)).toBe(true);
    expect(rounds.every((r) => r.pairs.length === 2)).toBe(true);

    const scheduled = new Set(rounds.flatMap((r) => r.pairs.map((p) => [...p].sort().join("-"))));
    expect(scheduled).toEqual(allPairs(teams));
  });

  it("gives every team exactly one bye per round for an odd team count", () => {
    const teams = ["A", "B", "C"];
    const rounds = generateRoundRobinSchedule(teams);

    expect(rounds).toHaveLength(3); // n rounds when odd (padded to 4 slots -> 3 rounds)
    expect(rounds.every((r) => r.pairs.length === 1)).toBe(true);
    expect(rounds.every((r) => r.byeTeamId !== undefined)).toBe(true);

    const byeCounts = new Map<string, number>();
    for (const round of rounds) {
      if (round.byeTeamId) byeCounts.set(round.byeTeamId, (byeCounts.get(round.byeTeamId) ?? 0) + 1);
    }
    expect(teams.every((t) => byeCounts.get(t) === 1)).toBe(true);

    const scheduled = new Set(rounds.flatMap((r) => r.pairs.map((p) => [...p].sort().join("-"))));
    expect(scheduled).toEqual(allPairs(teams));
  });

  it("covers every pair exactly once for a larger odd count (5 teams)", () => {
    const teams = ["A", "B", "C", "D", "E"];
    const rounds = generateRoundRobinSchedule(teams);
    const scheduled = rounds.flatMap((r) => r.pairs.map((p) => [...p].sort().join("-")));
    expect(new Set(scheduled)).toEqual(allPairs(teams));
    expect(scheduled).toHaveLength(allPairs(teams).size); // no duplicate pairings
  });

  it("returns no rounds for fewer than 2 teams", () => {
    expect(generateRoundRobinSchedule([])).toEqual([]);
    expect(generateRoundRobinSchedule(["A"])).toEqual([]);
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
      { schoolId: "school-a", position: 1, schoolLevel: "SENIOR_SCHOOL" },
    ]);
    expect(standings.SENIOR_SCHOOL.get("school-a")).toBe(7);
    expect(standings.PRIMARY.get("school-a")).toBeUndefined();
    expect(standings.OVERALL.get("school-a")).toBe(7);
  });

  it("credits a Primary placing to the Primary table and to Overall once", () => {
    const standings = computeSchoolLevelStandings([
      { schoolId: "school-a", position: 2, schoolLevel: "PRIMARY" },
    ]);
    expect(standings.PRIMARY.get("school-a")).toBe(5);
    expect(standings.JS.get("school-a")).toBeUndefined();
    expect(standings.SENIOR_SCHOOL.get("school-a")).toBeUndefined();
    expect(standings.TERTIARY.get("school-a")).toBeUndefined();
    expect(standings.OVERALL.get("school-a")).toBe(5);
  });

  it("credits a JS placing to the JS table and to Overall once", () => {
    const standings = computeSchoolLevelStandings([{ schoolId: "school-a", position: 1, schoolLevel: "JS" }]);
    expect(standings.JS.get("school-a")).toBe(7);
    expect(standings.PRIMARY.get("school-a")).toBeUndefined();
    expect(standings.OVERALL.get("school-a")).toBe(7);
  });

  it("credits a Tertiary placing to the Tertiary table and to Overall once", () => {
    const standings = computeSchoolLevelStandings([
      { schoolId: "school-a", position: 3, schoolLevel: "TERTIARY" },
    ]);
    expect(standings.TERTIARY.get("school-a")).toBe(4);
    expect(standings.OVERALL.get("school-a")).toBe(4);
  });

  it("accumulates points across multiple placings for the same school", () => {
    const standings = computeSchoolLevelStandings([
      { schoolId: "school-a", position: 1, schoolLevel: "SENIOR_SCHOOL" },
      { schoolId: "school-a", position: 3, schoolLevel: "SENIOR_SCHOOL" },
    ]);
    expect(standings.SENIOR_SCHOOL.get("school-a")).toBe(7 + 4);
    expect(standings.OVERALL.get("school-a")).toBe(7 + 4);
  });

  it("ignores placings outside the scoring positions", () => {
    const standings = computeSchoolLevelStandings([{ schoolId: "school-a", position: 8, schoolLevel: "SENIOR_SCHOOL" }]);
    expect(standings.OVERALL.has("school-a")).toBe(false);
  });
});
