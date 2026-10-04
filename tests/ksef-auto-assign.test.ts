import { describe, it, expect, vi, beforeEach } from "vitest";

const db = {
  ksefJudge: { findMany: vi.fn() },
  ksefEdition: { findUnique: vi.fn() },
  ksefResult: { findMany: vi.fn() },
  ksefJudgeAssignment: { createMany: vi.fn(), groupBy: vi.fn() },
  auditLog: { create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({
  prisma: { ...db, $transaction: (fn: (tx: typeof db) => Promise<unknown>) => fn(db) },
}));
vi.mock("@/lib/authorize", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/authorize")>()),
  requireRole: vi.fn().mockResolvedValue({ userId: "admin", roles: [{ role: "SUPER_ADMIN" }] }),
}));

const { POST } = await import("@/app/api/ksef/assignments/auto/route");

const ED = "55555555-5555-5555-5555-555555555555";
const ids = ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", "33333333-3333-3333-3333-333333333333"];
const judge = (id: string, extra = {}) => ({ id, editionId: ED, isActive: true, role: "JUDGE", user: { name: `Judge ${id.slice(0, 1)}` }, ...extra });
const post = (body: Record<string, unknown>) =>
  POST(new Request("http://x/api/ksef/assignments/auto", { method: "POST", body: JSON.stringify({ editionId: ED, level: "SUB_COUNTY", division: "ALL", judgesPerProject: 3, ...body }) }));

describe("POST /api/ksef/assignments/auto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.ksefEdition.findUnique.mockResolvedValue({ id: ED, name: "KSEF 2026", status: "ACTIVE" });
    db.ksefJudge.findMany.mockResolvedValue(ids.map((id) => judge(id)));
    db.ksefJudgeAssignment.groupBy.mockResolvedValue([]);
    db.ksefJudgeAssignment.createMany.mockImplementation(({ data }) => ({ count: data.length }));
    db.ksefResult.findMany.mockResolvedValue([
      { projectId: "p1", project: { code: "J-0001", assignments: [] } },
      { projectId: "p2", project: { code: "J-0002", assignments: [{ judgeId: ids[0] }] } },
    ]);
  });

  it("tops every project up to the requested number of judges", async () => {
    const res = await post({ judgeIds: ids });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ assigned: 5, projects: 2, shortfall: [] });
    const rows = db.ksefJudgeAssignment.createMany.mock.calls[0]![0].data;
    expect(rows.filter((r: { projectId: string }) => r.projectId === "p2")).toHaveLength(2);
    expect(rows.every((r: { level: string }) => r.level === "SUB_COUNTY")).toBe(true);
  });

  it("only covers the chosen school level", async () => {
    await post({ judgeIds: ids, division: "SENIOR_SCHOOL" });
    expect(db.ksefResult.findMany.mock.calls[0]![0].where.project).toMatchObject({ category: { division: "SENIOR_SCHOOL" } });
  });

  it("leaves Chief Judges out", async () => {
    db.ksefJudge.findMany.mockResolvedValue([judge(ids[0]!), judge(ids[1]!, { role: "CHIEF_JUDGE" })]);
    const res = await post({ judgeIds: ids.slice(0, 2) });
    expect(res.status).toBe(400);
    expect(db.ksefJudgeAssignment.createMany).not.toHaveBeenCalled();
  });

  it("reports projects it couldn't fully staff", async () => {
    db.ksefJudge.findMany.mockResolvedValue([judge(ids[0]!), judge(ids[1]!)]);
    const json = await (await post({ judgeIds: ids.slice(0, 2) })).json();
    expect(json.shortfall).toEqual([
      { code: "J-0001", missing: 1 },
      { code: "J-0002", missing: 1 },
    ]);
  });
});
