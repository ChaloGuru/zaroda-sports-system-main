import { describe, expect, it } from "vitest";
import { bracketSeedOrder, buildBracket, firstRoundName, seedQualifiers } from "@/lib/bracket";

const pools = (n: number, k: number) => Array.from({ length: n }, (_, p) => Array.from({ length: k }, (_, r) => `${"ABCDEFGH"[p]}${r + 1}`));
const names = (seeds: ReturnType<typeof seedQualifiers>) => buildBracket(seeds).map((m) => `${m.teamA.teamId} v ${m.teamB?.teamId ?? "bye"}`);

describe("bracket", () => {
  it("lays seeds out so the top two can only meet in the final", () => {
    expect(bracketSeedOrder(2)).toEqual([1, 2]);
    expect(bracketSeedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(bracketSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it("names the first round by bracket size", () => {
    expect(firstRoundName(2)).toBe("Final");
    expect(firstRoundName(4)).toBe("Semifinal");
    expect(firstRoundName(8)).toBe("Quarterfinal");
    expect(firstRoundName(16)).toBe("Round of 16");
  });

  it("two pools, top two: winners meet the other pool's runner-up", () => {
    expect(names(seedQualifiers(pools(2, 2), 2))).toEqual(["A1 v B2", "B1 v A2"]);
  });

  it("four pools, top two: quarterfinals with no pool-mates meeting", () => {
    const bracket = buildBracket(seedQualifiers(pools(4, 2), 2));
    expect(bracket).toHaveLength(4);
    for (const m of bracket) expect(m.teamA.poolIndex).not.toBe(m.teamB?.poolIndex);
    expect(bracket.every((m) => m.teamA.place === 1 && m.teamB?.place === 2)).toBe(true);
  });

  it("three pools, top two: the two best winners get byes, no pool-mates meet", () => {
    const bracket = buildBracket(seedQualifiers(pools(3, 2), 2));
    expect(bracket).toHaveLength(4);
    expect(bracket.filter((m) => m.teamB === null).map((m) => m.teamA.teamId)).toEqual(["A1", "B1"]);
    for (const m of bracket) if (m.teamB) expect(m.teamA.poolIndex).not.toBe(m.teamB.poolIndex);
  });

  it("five pool winners: three byes and one play-in", () => {
    const bracket = buildBracket(seedQualifiers(pools(5, 3), 1));
    expect(bracket).toHaveLength(4);
    expect(bracket.filter((m) => m.teamB === null)).toHaveLength(3);
    expect(names(seedQualifiers(pools(5, 3), 1))).toContain("D1 v E1");
  });

  it("skips pools that have fewer teams than asked for", () => {
    const seeds = seedQualifiers([["A1", "A2"], ["B1"]], 2);
    expect(seeds.map((s) => s.teamId)).toEqual(["A1", "B1", "A2"]);
  });
});
