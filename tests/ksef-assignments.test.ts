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
const judge = (id: string, name: string, extra = {}) => ({ id, editionId: "ed-1", isActive: true, user: { name }, ...extra });
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

  it("refuses judges from different competitions", async () => {
    db.ksefJudge.findMany.mockResolvedValue([judge(J1, "A"), judge(J2, "B", { editionId: "ed-2" })]);
    expect((await post({ judgeIds: [J1, J2], projectIds: [P1], level: "SUB_COUNTY" })).status).toBe(400);
  });

  it("requires at least one judge", async () => {
    expect((await post({ judgeIds: [], projectIds: [P1], level: "SUB_COUNTY" })).status).toBe(400);
  });
});
