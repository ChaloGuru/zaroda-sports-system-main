import { describe, it, expect } from "vitest";
import { bestMark, isFieldEvent, isVerticalJump, normalizeAttempt, rankFieldResults } from "@/lib/field-events";

describe("isFieldEvent", () => {
  it("covers jumps and throws, not races or points-scored events", () => {
    for (const name of ["Long Jump", "High Jump", "Triple Jump", "Discus", "Shot Put", "Javelin"]) {
      expect(isFieldEvent({ category: "ATHLETICS", isTimed: false, name })).toBe(true);
    }
    expect(isFieldEvent({ category: "ATHLETICS", isTimed: true, name: "100M" })).toBe(false);
    expect(isFieldEvent({ category: "ATHLETICS", isTimed: false, name: "Gymnastics" })).toBe(false);
    expect(isFieldEvent({ category: "ATHLETICS", isTimed: false, name: "Kids Athletics (8-11 years)" })).toBe(false);
    expect(isFieldEvent({ category: "MUSIC", isTimed: false, name: "Long Jump" })).toBe(false);
  });

  it("identifies vertical jumps", () => {
    expect(isVerticalJump("High Jump")).toBe(true);
    expect(isVerticalJump("Pole Vault")).toBe(true);
    expect(isVerticalJump("Long Jump")).toBe(false);
  });
});

describe("normalizeAttempt", () => {
  it("normalizes marks, fouls, passes and blanks", () => {
    expect(normalizeAttempt("5.3")).toBe("5.30");
    expect(normalizeAttempt(" 12.456 m")).toBe("12.46");
    expect(normalizeAttempt("x")).toBe("X");
    expect(normalizeAttempt("Foul")).toBe("X");
    expect(normalizeAttempt("p")).toBe("-");
    expect(normalizeAttempt("-")).toBe("-");
    expect(normalizeAttempt("  ")).toBeNull();
  });

  it("rejects typos and impossible marks rather than guessing", () => {
    expect(() => normalizeAttempt("5,32")).toThrow();
    expect(() => normalizeAttempt("abc")).toThrow();
    expect(() => normalizeAttempt("0")).toThrow();
    expect(() => normalizeAttempt("200")).toThrow();
  });
});

describe("bestMark / rankFieldResults", () => {
  it("takes the best valid mark, ignoring fouls and passes", () => {
    expect(bestMark(["5.10", "X", "5.32"])).toBe(5.32);
    expect(bestMark(["X", "-", "X"])).toBeNull();
  });

  it("breaks ties on the next-best mark and shares a place when still level", () => {
    const positions = rankFieldResults([
      { id: "a", attempts: ["5.30", "5.10", "X"] },
      { id: "b", attempts: ["5.30", "5.20", "X"] }, // same best, better 2nd -> ahead of a
      { id: "c", attempts: ["5.50", "X", "X"] },
      { id: "d", attempts: ["5.10", "5.30", "X"] }, // identical series to a -> shares a's place
      { id: "e", attempts: ["X", "X", "X"] }, // no valid mark -> unplaced
    ]);
    expect(positions.get("c")).toBe(1);
    expect(positions.get("b")).toBe(2);
    expect(positions.get("a")).toBe(3);
    expect(positions.get("d")).toBe(3);
    expect(positions.has("e")).toBe(false);
  });
});
