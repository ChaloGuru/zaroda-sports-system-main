import { describe, it, expect } from "vitest";
import { distributeMatchDates, distributeMatchDatesFromEnd } from "@/lib/match-day";

describe("distributeMatchDates", () => {
  it("returns null for every round when the championship is single-day", () => {
    const day = new Date("2026-07-10T00:00:00.000Z");
    const result = distributeMatchDates(day, day, 3);
    expect(result).toEqual([null, null, null]);
  });

  it("assigns one calendar day per round across a multi-day championship", () => {
    const start = new Date("2026-07-10T00:00:00.000Z");
    const end = new Date("2026-07-12T00:00:00.000Z"); // 3 days: 10th, 11th, 12th
    const result = distributeMatchDates(start, end, 3);

    expect(result[0]?.toISOString().slice(0, 10)).toBe("2026-07-10");
    expect(result[1]?.toISOString().slice(0, 10)).toBe("2026-07-11");
    expect(result[2]?.toISOString().slice(0, 10)).toBe("2026-07-12");
  });

  it("cycles back to day one when there are more rounds than days", () => {
    const start = new Date("2026-07-10T00:00:00.000Z");
    const end = new Date("2026-07-11T00:00:00.000Z"); // 2 days
    const result = distributeMatchDates(start, end, 5);

    expect(result.map((d) => d?.toISOString().slice(0, 10))).toEqual([
      "2026-07-10",
      "2026-07-11",
      "2026-07-10",
      "2026-07-11",
      "2026-07-10",
    ]);
  });
});

describe("distributeMatchDatesFromEnd", () => {
  it("returns null for every round when the championship is single-day", () => {
    const day = new Date("2026-07-10T00:00:00.000Z");
    expect(distributeMatchDatesFromEnd(day, day, 2)).toEqual([null, null]);
  });

  it("places the final round on the championship's last day, counting backward", () => {
    const start = new Date("2026-07-10T00:00:00.000Z");
    const end = new Date("2026-07-12T00:00:00.000Z"); // 3 days
    const result = distributeMatchDatesFromEnd(start, end, 2); // semis, final

    expect(result.map((d) => d?.toISOString().slice(0, 10))).toEqual(["2026-07-11", "2026-07-12"]);
  });

  it("clamps to the championship start when there are more rounds than days", () => {
    const start = new Date("2026-07-10T00:00:00.000Z");
    const end = new Date("2026-07-11T00:00:00.000Z"); // 2 days
    const result = distributeMatchDatesFromEnd(start, end, 4);

    expect(result.map((d) => d?.toISOString().slice(0, 10))).toEqual([
      "2026-07-10",
      "2026-07-10",
      "2026-07-10",
      "2026-07-11",
    ]);
  });
});
