import { describe, it, expect, vi, beforeEach } from "vitest";
import { KSEF_JUNIOR_SCORE_SHEET } from "@/lib/ksef-config";

const CRITERIA = KSEF_JUNIOR_SCORE_SHEET.map((c, i) => ({ ...c, id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, description: c.description || null, section: c.section ?? null, levelScored: true }));
const idOf = (prefix: string) => CRITERIA.find((c) => c.name.startsWith(prefix))!.id;

const db = {
  ksefScore: { deleteMany: vi.fn(), createMany: vi.fn() },
  ksefJudgeAssignment: { update: vi.fn().mockResolvedValue({ id: "a1" }) },
  auditLog: { create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: { ...db, $transaction: (fn: (tx: typeof db) => Promise<unknown>) => fn(db) } }));
vi.mock("@/lib/ksef", () => ({
  requireOwnScoreSheet: vi.fn().mockResolvedValue({
    ctx: { userId: "judge-user" },
    assignment: { id: "a1", projectId: "p1", level: "SUB_COUNTY", judge: { editionId: "ed-1" }, project: { category: { division: "JUNIOR_SCHOOL" } } },
  }),
  criteriaForDivision: vi.fn(async () => CRITERIA),
  evaluateDiscrepancy: vi.fn().mockResolvedValue(null),
  requireScoreSheetViewer: vi.fn(),
  requireKsefAdmin: vi.fn(),
  getEditableEdition: vi.fn(),
}));

const { PUT } = await import("@/app/api/ksef/assignments/[id]/route");

/** Every criterion at EE (full marks), with overrides. */
function sheet(overrides: Record<string, number>) {
  return CRITERIA.map((c) => ({ criterionId: c.id, score: overrides[c.id] ?? c.maxScore }));
}
const put = (scores: { criterionId: string; score: number }[], submit = true) =>
  PUT(new Request("http://x/api/ksef/assignments/a1", { method: "PUT", body: JSON.stringify({ scores, submit }) }), {
    params: Promise.resolve({ id: "a1" }),
  });

describe("PUT /api/ksef/assignments/[id] - official sheet rules", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts a full sheet of level marks", async () => {
    expect((await put(sheet({}))).status).toBe(200);
  });

  it("accepts 0 as a level", async () => {
    expect((await put(sheet({ [idOf("Originality")]: 0 }))).status).toBe(200);
  });

  it("rejects a mark that isn't one of the levels", async () => {
    const res = await put(sheet({ [idOf("Data")]: 2 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Data");
  });

  it("rejects marks for results and data when Methods scored 0", async () => {
    const res = await put(sheet({ [idOf("Methods")]: 0 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/must be 0 because "Methods/);
    expect(db.ksefScore.createMany).not.toHaveBeenCalled();
  });

  it("accepts the sheet once those items are 0 too", async () => {
    const zeroes = Object.fromEntries(
      ["Methods", "Analysis of results", "Discussion of results", "Data", "Logical sequence - "].flatMap((prefix) =>
        CRITERIA.filter((c) => c.name.startsWith(prefix)).map((c) => [c.id, 0]),
      ),
    );
    expect((await put(sheet(zeroes))).status).toBe(200);
  });

  it("requires Procedure to be 0 when Apparatus is 0", async () => {
    const res = await put(sheet({ [idOf("Logical sequence - apparatus")]: 0 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Logical sequence - procedure");
  });
});
