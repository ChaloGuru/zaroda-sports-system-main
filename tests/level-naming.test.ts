import { describe, it, expect } from "vitest";
import { withLevelInName, LEVEL_LABELS } from "@/lib/utils";

describe("withLevelInName", () => {
  it("appends the level label when it's not already present", () => {
    expect(withLevelInName("Nairobi Sports Day", "ZONE")).toBe("Nairobi Sports Day - Zone");
  });

  it("does not duplicate the label if it's already present", () => {
    expect(withLevelInName("Kisumu County Championship", "COUNTY")).toBe("Kisumu County Championship");
  });

  it("is case-insensitive when checking for an existing label", () => {
    expect(withLevelInName("Bungoma national finals", "NATIONAL")).toBe("Bungoma national finals");
  });

  it("uses the correct label for every level", () => {
    expect(LEVEL_LABELS.SUB_COUNTY).toBe("Sub-County");
    expect(withLevelInName("Kajiado Meet", "SUB_COUNTY")).toBe("Kajiado Meet - Sub-County");
  });
});
