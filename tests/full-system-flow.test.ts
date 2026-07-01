import { describe, it, expect } from "vitest";
import {
  assignNextBibNumber,
  validateBibRangeNoOverlap,
  seedLanes,
  parseTimeToSeconds,
  formatSecondsToTime,
  pointsForPosition,
  computeSchoolLevelStandings,
  computeStandings,
  type BibRange,
} from "@/lib/scoring";

/**
 * Exercises the pure scoring pipeline end-to-end the way a real championship
 * would use it: allocate bib blocks -> register participants -> seed lanes
 * for a heat -> record finishing times -> derive positions -> roll placings
 * up into school-level standings. No DB/network - this is the "full system
 * flow" test for the scoring/ranking module.
 */
describe("full athletics event flow", () => {
  it("takes a 100m final from bib allocation through to school-level standings", () => {
    const ranges: BibRange[] = [
      { schoolId: "alliance", rangeStart: 1, rangeEnd: 10 },
      { schoolId: "starehe", rangeStart: 11, rangeEnd: 20 },
    ];
    validateBibRangeNoOverlap(ranges[1]!, [ranges[0]!]);

    const allianceBib1 = assignNextBibNumber("alliance", ranges[0], []);
    const allianceBib2 = assignNextBibNumber("alliance", ranges[0], [allianceBib1]);
    const stareheBib1 = assignNextBibNumber("starehe", ranges[1], []);
    expect([allianceBib1, allianceBib2, stareheBib1]).toEqual([1, 2, 11]);

    const finalists = [
      { participantId: "runner-alliance-1", personalBest: parseTimeToSeconds("10.9") },
      { participantId: "runner-starehe-1", personalBest: parseTimeToSeconds("11.4") },
      { participantId: "runner-alliance-2", personalBest: parseTimeToSeconds("11.1") },
    ];
    const laneAssignments = seedLanes(finalists);
    expect(laneAssignments[0]?.participantId).toBe("runner-alliance-1"); // fastest -> best lane priority

    const finishTimes: Record<string, string> = {
      "runner-alliance-1": "0:10.85",
      "runner-alliance-2": "0:11.02",
      "runner-starehe-1": "0:11.30",
    };
    const ranked = Object.entries(finishTimes)
      .map(([participantId, timeInput]) => ({ participantId, seconds: parseTimeToSeconds(timeInput) }))
      .sort((a, b) => a.seconds - b.seconds)
      .map((entry, index) => ({ ...entry, position: index + 1 }));

    expect(ranked[0]?.participantId).toBe("runner-alliance-1");
    expect(formatSecondsToTime(ranked[0]!.seconds)).toBe("0:10.85");

    const placings = ranked.map((r) => ({
      schoolId: r.participantId.includes("alliance") ? "alliance" : "starehe",
      position: r.position,
      schoolLevel: "SECONDARY" as const,
    }));
    const standings = computeSchoolLevelStandings(placings);

    // 1st (7) + 2nd (5) for Alliance's two finishers, 3rd (4) for Starehe.
    expect(standings.SECONDARY.get("alliance")).toBe(pointsForPosition(1) + pointsForPosition(2));
    expect(standings.SECONDARY.get("starehe")).toBe(pointsForPosition(3));
    expect(standings.OVERALL.get("alliance")).toBe(12);
  });

  it("carries a football round-robin group through to final standings and cross-checks against school-level points", () => {
    const results = [
      { teamAId: "alliance", teamBId: "starehe", teamAScore: 2, teamBScore: 1 },
      { teamAId: "alliance", teamBId: "mangu", teamAScore: 1, teamBScore: 1 },
      { teamAId: "starehe", teamBId: "mangu", teamAScore: 0, teamBScore: 2 },
    ];
    const standings = computeStandings(["alliance", "starehe", "mangu"], results, "FOOTBALL");

    // Alliance tops the group on points (4), Mangu second (4 via head-to-head/GD math varies),
    // regardless of exact ranking, points must reconcile with the underlying match points.
    const totalPoints = standings.reduce((sum, row) => sum + row.points, 0);
    // 1 win+loss pair (3+0) + 1 draw pair (1+1) + 1 win+loss pair (3+0) = 8
    expect(totalPoints).toBe(8);

    const placings = standings.map((row, index) => ({
      schoolId: row.teamId,
      position: index + 1,
      schoolLevel: "SECONDARY" as const,
    }));
    const schoolStandings = computeSchoolLevelStandings(placings);
    const totalOverall = Array.from(schoolStandings.OVERALL.values()).reduce((a, b) => a + b, 0);
    expect(totalOverall).toBe(pointsForPosition(1) + pointsForPosition(2) + pointsForPosition(3));
  });
});
