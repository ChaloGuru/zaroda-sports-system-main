import { describe, expect, it } from "vitest";
import { isHigherLevel, promotionBlockReason } from "@/lib/utils";

describe("promotion levels", () => {
  it("goes up the school ladder only", () => {
    expect(promotionBlockReason("ZONE", "SUB_COUNTY")).toBeNull();
    expect(promotionBlockReason("BASE", "NATIONAL")).toBeNull();
    expect(promotionBlockReason("COUNTY", "ZONE")).toMatch(/higher-level/);
    expect(promotionBlockReason("COUNTY", "COUNTY")).toMatch(/higher-level/);
  });

  it("never moves teams out of or into an open tournament", () => {
    expect(promotionBlockReason("OPEN_TOURNAMENT", "ZONE")).toMatch(/Open tournaments/);
    expect(promotionBlockReason("OPEN_TOURNAMENT", "NATIONAL")).toMatch(/Open tournaments/);
    expect(promotionBlockReason("ZONE", "OPEN_TOURNAMENT")).toMatch(/Open tournaments/);
    expect(isHigherLevel("ZONE", "OPEN_TOURNAMENT")).toBe(false);
    expect(isHigherLevel("OPEN_TOURNAMENT", "ZONE")).toBe(false);
  });
});
