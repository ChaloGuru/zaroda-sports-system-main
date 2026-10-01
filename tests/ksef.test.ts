import { describe, it, expect, vi } from "vitest";

// lib/ksef.ts imports next/headers and the Prisma client; only its pure
// seeding logic is exercised here, through a fake transaction client.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  STANDARD_KSEF_STRUCTURE,
  averageJudgeTotal,
  competitionUnit,
  nextKsefLevel,
  rankKsefResults,
  regionForCounty,
} from "@/lib/ksef-config";
import { seedEditionConfig } from "@/lib/ksef";

describe("KSEF reference data", () => {
  it("maps counties to their KSEF region", () => {
    expect(regionForCounty("Migori")).toBe("Nyanza");
    expect(regionForCounty("  nairobi ")).toBe("Nairobi");
    expect(regionForCounty("Uasin Gishu")).toBe("Rift Valley");
    expect(regionForCounty("Atlantis")).toBe("Unknown");
  });

  it("uses the right competition unit per level", () => {
    const school = { subcounty: "Uriri", county: "Migori", region: "Nyanza" };
    expect(competitionUnit("SUB_COUNTY", school)).toBe("Uriri, Migori");
    expect(competitionUnit("COUNTY", school)).toBe("Migori");
    expect(competitionUnit("REGIONAL", school)).toBe("Nyanza");
    expect(competitionUnit("NATIONAL", school)).toBe("National");
  });

  it("walks the edition's own level ladder", () => {
    const ladder = ["SUB_COUNTY", "COUNTY", "REGIONAL", "NATIONAL"] as const;
    expect(nextKsefLevel(ladder, "SUB_COUNTY")).toBe("COUNTY");
    expect(nextKsefLevel(ladder, "NATIONAL")).toBeNull();
    // An edition that skips Regional goes straight from County to National.
    expect(nextKsefLevel(["SUB_COUNTY", "COUNTY", "NATIONAL"], "COUNTY")).toBe("NATIONAL");
  });

  it("keeps no year in the standard starting structure", () => {
    expect(JSON.stringify(STANDARD_KSEF_STRUCTURE)).not.toMatch(/20\d\d/);
  });
});

describe("KSEF scoring", () => {
  it("averages submitted judge totals to 2 decimals", () => {
    expect(averageJudgeTotal([80, 75, 71])).toBe(75.33);
    expect(averageJudgeTotal([])).toBeNull();
  });

  it("ranks within each area + category, sharing tied ranks and skipping unscored", () => {
    const ranks = rankKsefResults([
      { id: "a", unit: "Migori", categoryId: "chem", totalScore: 80 },
      { id: "b", unit: "Migori", categoryId: "chem", totalScore: 92 },
      { id: "c", unit: "Migori", categoryId: "chem", totalScore: 80 },
      { id: "d", unit: "Migori", categoryId: "chem", totalScore: 60 },
      { id: "e", unit: "Migori", categoryId: "chem", totalScore: null },
      { id: "f", unit: "Kisumu", categoryId: "chem", totalScore: 50 }, // other county
      { id: "g", unit: "Migori", categoryId: "bio", totalScore: 40 }, // other category
    ]);
    expect(ranks.get("b")).toBe(1);
    expect(ranks.get("a")).toBe(2);
    expect(ranks.get("c")).toBe(2);
    expect(ranks.get("d")).toBe(4);
    expect(ranks.has("e")).toBe(false);
    expect(ranks.get("f")).toBe(1);
    expect(ranks.get("g")).toBe(1);
  });
});

describe("seedEditionConfig", () => {
  function fakeTx(source?: unknown) {
    const categories: Array<{ data: Record<string, unknown> }> = [];
    const criteria: Array<Record<string, unknown>> = [];
    const tx = {
      ksefEdition: { findUnique: vi.fn(async () => source ?? null) },
      ksefCategory: { create: vi.fn(async (args: { data: Record<string, unknown> }) => categories.push(args)) },
      ksefCriterion: { createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => criteria.push(...data)) },
    };
    return { tx, categories, criteria };
  }

  it("starts from the standard structure", async () => {
    const { tx, categories, criteria } = fakeTx();
    await seedEditionConfig(tx as never, "new-edition", { kind: "STANDARD" });
    expect(categories).toHaveLength(STANDARD_KSEF_STRUCTURE.categories.length);
    expect(criteria).toHaveLength(STANDARD_KSEF_STRUCTURE.criteria.length);
    expect(categories.every((c) => c.data.editionId === "new-edition")).toBe(true);
  });

  it("deep-copies an earlier edition's configuration into new rows for the new edition", async () => {
    const { tx, categories, criteria } = fakeTx({
      id: "old",
      categories: [
        { id: "old-cat", division: "SENIOR_SCHOOL", name: "Physics", isActive: false, subCategories: [{ id: "old-sub", name: "Optics" }] },
      ],
      criteria: [{ id: "old-crit", division: null, name: "Creativity", description: null, maxScore: 25, isActive: true }],
    });
    await seedEditionConfig(tx as never, "new-edition", { kind: "COPY", fromEditionId: "old" });

    const [category] = categories;
    expect(category?.data).toMatchObject({ editionId: "new-edition", name: "Physics", isActive: false });
    expect(category?.data).not.toHaveProperty("id");
    expect(category?.data.subCategories).toEqual({ create: [{ name: "Optics", sortOrder: 0 }] });
    expect(criteria[0]).toMatchObject({ editionId: "new-edition", name: "Creativity", maxScore: 25 });
    expect(criteria[0]).not.toHaveProperty("id");
  });

  it("creates nothing when starting empty", async () => {
    const { tx, categories, criteria } = fakeTx();
    await seedEditionConfig(tx as never, "new-edition", { kind: "EMPTY" });
    expect(categories).toHaveLength(0);
    expect(criteria).toHaveLength(0);
  });
});
