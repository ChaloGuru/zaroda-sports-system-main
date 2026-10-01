import { describe, it, expect, vi, beforeEach } from "vitest";

const ctx = { userId: "u-judge", email: "j@x", tenantId: null, roles: [] as { role: string }[] };
const assignmentFindUnique = vi.fn();
const judgeFindFirst = vi.fn();
const assignmentCount = vi.fn();

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ksefJudgeAssignment: { findUnique: (...a: unknown[]) => assignmentFindUnique(...a), count: (...a: unknown[]) => assignmentCount(...a) },
    ksefJudge: { findFirst: (...a: unknown[]) => judgeFindFirst(...a) },
  },
}));
vi.mock("@/lib/authorize", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/authorize")>();
  return {
    ...actual,
    requireAuth: async () => ctx,
    isSuperAdmin: (c: typeof ctx) => c.roles.some((r) => r.role === "SUPER_ADMIN"),
  };
});

import { checkJudgeDiscrepancy } from "@/lib/ksef-config";
import { requireChiefJudgeFor, requireOwnScoreSheet, requireScoreSheetViewer } from "@/lib/ksef";

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    projectId: "p1",
    level: "SUB_COUNTY",
    submittedAt: null,
    judge: { userId: "u-judge", isActive: true, editionId: "e1", edition: { status: "ACTIVE", name: "KSEF X" } },
    project: { category: { division: "SENIOR_SCHOOL" } },
    ...overrides,
  };
}

beforeEach(() => {
  ctx.userId = "u-judge";
  ctx.roles = [];
  assignmentFindUnique.mockReset();
  judgeFindFirst.mockReset();
  assignmentCount.mockReset();
});

describe("checkJudgeDiscrepancy", () => {
  it("needs at least two submitted sheets", () => {
    expect(checkJudgeDiscrepancy([70], { threshold: 10, basis: "POINTS", maxTotal: 100 })).toBeNull();
  });

  it("flags only when the spread is strictly greater than a marks threshold", () => {
    expect(checkJudgeDiscrepancy([78, 80, 40], { threshold: 15, basis: "POINTS", maxTotal: 100 })).toEqual({ spread: 40, thresholdMarks: 15, exceeds: true });
    expect(checkJudgeDiscrepancy([70, 85], { threshold: 15, basis: "POINTS", maxTotal: 100 })?.exceeds).toBe(false);
  });

  it("converts a percentage threshold using the score sheet maximum", () => {
    // 10% of 80 = 8 marks
    expect(checkJudgeDiscrepancy([60, 69], { threshold: 10, basis: "PERCENT", maxTotal: 80 })).toEqual({ spread: 9, thresholdMarks: 8, exceeds: true });
    expect(checkJudgeDiscrepancy([60, 68], { threshold: 10, basis: "PERCENT", maxTotal: 80 })?.exceeds).toBe(false);
  });
});

describe("score sheet access", () => {
  it("lets the assigned judge write their own draft sheet", async () => {
    assignmentFindUnique.mockResolvedValue(assignment());
    await expect(requireOwnScoreSheet("a1")).resolves.toMatchObject({ assignment: { id: "a1" } });
  });

  it("refuses to change a submitted sheet, even for its own judge", async () => {
    assignmentFindUnique.mockResolvedValue(assignment({ submittedAt: new Date() }));
    await expect(requireOwnScoreSheet("a1")).rejects.toThrow(/submitted/);
  });

  it("never lets the KSEF administrator write a judge's scores", async () => {
    ctx.userId = "u-admin";
    ctx.roles = [{ role: "SUPER_ADMIN" }];
    assignmentFindUnique.mockResolvedValue(assignment());
    await expect(requireOwnScoreSheet("a1")).rejects.toThrow(/Only the assigned judge/);
  });

  it("keeps judges from seeing each other's sheets", async () => {
    ctx.userId = "u-other-judge";
    assignmentFindUnique.mockResolvedValue(assignment());
    judgeFindFirst.mockResolvedValue({ role: "JUDGE" });
    assignmentCount.mockResolvedValue(1);
    await expect(requireScoreSheetViewer("a1")).rejects.toThrow(/isn't available/);
  });

  it("lets a non-conflicted Chief Judge view a sheet read-only", async () => {
    ctx.userId = "u-chief";
    assignmentFindUnique.mockResolvedValue(assignment());
    judgeFindFirst.mockResolvedValue({ role: "CHIEF_JUDGE" });
    assignmentCount.mockResolvedValue(0);
    await expect(requireScoreSheetViewer("a1")).resolves.toMatchObject({ isOwnSheet: false });
  });
});

describe("requireChiefJudgeFor", () => {
  it("allows an active Chief Judge who isn't judging the project", async () => {
    ctx.userId = "u-chief";
    judgeFindFirst.mockResolvedValue({ role: "CHIEF_JUDGE" });
    assignmentCount.mockResolvedValue(0);
    await expect(requireChiefJudgeFor("e1", "p1", "SUB_COUNTY")).resolves.toBe(ctx);
  });

  it("blocks a Chief Judge from reviewing a project they're judging", async () => {
    ctx.userId = "u-chief";
    judgeFindFirst.mockResolvedValue({ role: "CHIEF_JUDGE" });
    assignmentCount.mockResolvedValue(1);
    await expect(requireChiefJudgeFor("e1", "p1", "SUB_COUNTY")).rejects.toThrow(/another Chief Judge/);
  });

  it("blocks ordinary judges and SRC members", async () => {
    judgeFindFirst.mockResolvedValue({ role: "JUDGE" });
    await expect(requireChiefJudgeFor("e1", "p1", "SUB_COUNTY")).rejects.toThrow(/Only a Chief Judge/);
    judgeFindFirst.mockResolvedValue({ role: "SRC_MEMBER" });
    await expect(requireChiefJudgeFor("e1", "p1", "SUB_COUNTY")).rejects.toThrow(/Only a Chief Judge/);
  });
});
