import { describe, it, expect, vi, beforeEach } from "vitest";

const db = {
  ksefJudge: { findMany: vi.fn() },
  ksefEdition: { findUnique: vi.fn() },
  ksefResult: { findMany: vi.fn() },
  ksefJudgeAssignment: { createMany: vi.fn() },
  auditLog: { create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({
  prisma: { ...db, $transaction: (fn: (tx: typeof db) => Promise<unknown>) => fn(db) },
}));
vi.mock("@/lib/authorize", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/authorize")>()),
  requireRole: vi.fn().mockResolvedValue({ userId: "admin", roles: [{ role: "SUPER_ADMIN" }] }),
}));

const { POST } = await import("@/app/api/ksef/assignments/route");

const J1 = "11111111-1111-1111-1111-111111111111";
const J2 = "22222222-2222-2222-2222-222222222222";
const P1 = "33333333-3333-3333-3333-333333333333";
const P2 = "44444444-4444-4444-4444-444444444444";
const judge = (id: string, name: string, extra = {}) => ({ id, editionId: "ed-1", isActive: true, role: "JUDGE", user: { name }, ...extra });
const post = (body: unknown) => POST(new Request("http://x/api/ksef/assignments", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/ksef/assignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.ksefEdition.findUnique.mockResolvedValue({ id: "ed-1", name: "KSEF 2026", status: "ACTIVE" });
    db.ksefResult.findMany.mockResolvedValue([{ projectId: P1 }, { projectId: P2 }]);
    db.ksefJudgeAssignment.createMany.mockImplementation(({ data }) => ({ count: data.length }));
  });

  it("assigns every selected judge to every selected project in one go", async () => {
    db.ksefJudge.findMany.mockResolvedValue([judge(J1, "Ongo Oduor"), judge(J2, "Peter Ongo")]);

    const res = await post({ judgeIds: [J1, J2], projectIds: [P1, P2], level: "SUB_COUNTY" });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ assigned: 4 });
    const { data, skipDuplicates } = db.ksefJudgeAssignment.createMany.mock.calls[0]![0];
    expect(skipDuplicates).toBe(true);
    expect(data).toEqual([
      { judgeId: J1, projectId: P1, level: "SUB_COUNTY" },
      { judgeId: J1, projectId: P2, level: "SUB_COUNTY" },
      { judgeId: J2, projectId: P1, level: "SUB_COUNTY" },
      { judgeId: J2, projectId: P2, level: "SUB_COUNTY" },
    ]);
  });

  it("refuses if any selected judge is deactivated, naming them", async () => {
    db.ksefJudge.findMany.mockResolvedValue([judge(J1, "Ongo Oduor"), judge(J2, "Peter Ongo", { isActive: false })]);

    const res = await post({ judgeIds: [J1, J2], projectIds: [P1], level: "SUB_COUNTY" });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Peter Ongo");
    expect(db.ksefJudgeAssignment.createMany).not.toHaveBeenCalled();
  });

  it("never gives projects to a Chief Judge", async () => {
    db.ksefJudge.findMany.mockResolvedValue([judge(J1, "Ongo Oduor"), judge(J2, "Odwuor Peter Ongo", { role: "CHIEF_JUDGE" })]);

    const res = await post({ judgeIds: [J1, J2], projectIds: [P1], level: "SUB_COUNTY" });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Odwuor Peter Ongo");
    expect(db.ksefJudgeAssignment.createMany).not.toHaveBeenCalled();
  });

  it("refuses judges from different competitions", async () => {
    db.ksefJudge.findMany.mockResolvedValue([judge(J1, "A"), judge(J2, "B", { editionId: "ed-2" })]);
    expect((await post({ judgeIds: [J1, J2], projectIds: [P1], level: "SUB_COUNTY" })).status).toBe(400);
  });

  it("requires at least one judge", async () => {
    expect((await post({ judgeIds: [], projectIds: [P1], level: "SUB_COUNTY" })).status).toBe(400);
  });
});

describe("planAutoAssignments", async () => {
  const { planAutoAssignments } = await import("@/lib/ksef-config");
  const loads = (plan: { assignments: { judgeId: string }[] }) =>
    plan.assignments.reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.judgeId]: (acc[a.judgeId] ?? 0) + 1 }), {});

  it("gives every project the requested number of different judges, spread evenly", () => {
    const projects = ["p1", "p2", "p3", "p4"].map((id) => ({ id, judgeIds: [] }));
    const judges = ["a", "b", "c", "d"].map((id) => ({ id, load: 0 }));

    const plan = planAutoAssignments(projects, judges, 3);

    expect(plan.shortfall).toEqual([]);
    for (const p of projects) {
      const assigned = plan.assignments.filter((a) => a.projectId === p.id).map((a) => a.judgeId);
      expect(new Set(assigned).size).toBe(3);
    }
    expect(Object.values(loads(plan))).toEqual([3, 3, 3, 3]);
  });

  it("tops up existing assignments instead of replacing them, and never repeats a judge", () => {
    const plan = planAutoAssignments([{ id: "p1", judgeIds: ["a"] }, { id: "p2", judgeIds: ["a", "b", "c"] }], [
      { id: "a", load: 2 },
      { id: "b", load: 1 },
      { id: "c", load: 1 },
    ], 3);

    expect(plan.assignments).toEqual([
      { judgeId: "b", projectId: "p1" },
      { judgeId: "c", projectId: "p1" },
    ]);
  });

  it("prefers the least-loaded judges", () => {
    const plan = planAutoAssignments([{ id: "p1", judgeIds: [] }], [
      { id: "busy", load: 5 },
      { id: "free", load: 0 },
    ], 1);
    expect(plan.assignments).toEqual([{ judgeId: "free", projectId: "p1" }]);
  });

  it("reports projects that can't reach the target with the judges available", () => {
    const plan = planAutoAssignments([{ id: "p1", judgeIds: [] }], [{ id: "a", load: 0 }, { id: "b", load: 0 }], 3);
    expect(plan.assignments).toHaveLength(2);
    expect(plan.shortfall).toEqual([{ projectId: "p1", missing: 1 }]);
  });
});
