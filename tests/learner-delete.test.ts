import { describe, it, expect, vi, beforeEach } from "vitest";

const learnerFindUnique = vi.fn();
const challengeFindFirst = vi.fn();
const participantFindMany = vi.fn();
const participantFindFirst = vi.fn();
const heatFindFirst = vi.fn();
const teamFindUnique = vi.fn();
const championshipFindUnique = vi.fn();
const txParticipantDeleteMany = vi.fn();
const txLearnerDelete = vi.fn();
const requireChampionshipAccess = vi.fn();
const getAuthContext = vi.fn();
const championshipSchoolFindMany = vi.fn();

vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/authorize", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authorize")>("@/lib/authorize");
  return {
    ...actual,
    requireChampionshipAccess: (...a: unknown[]) => requireChampionshipAccess(...a),
    getAuthContext: (...a: unknown[]) => getAuthContext(...a),
  };
});
const tx = {
  participant: { deleteMany: (...a: unknown[]) => txParticipantDeleteMany(...a) },
  learner: { delete: (...a: unknown[]) => txLearnerDelete(...a) },
  auditLog: { create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    learner: { findUnique: (...a: unknown[]) => learnerFindUnique(...a) },
    learnerChallenge: { findFirst: (...a: unknown[]) => challengeFindFirst(...a) },
    participant: { findMany: (...a: unknown[]) => participantFindMany(...a), findFirst: (...a: unknown[]) => participantFindFirst(...a) },
    heat: { findFirst: (...a: unknown[]) => heatFindFirst(...a) },
    tournamentTeam: { findUnique: (...a: unknown[]) => teamFindUnique(...a), findMany: async () => [] },
    championship: { findUnique: (...a: unknown[]) => championshipFindUnique(...a) },
    championshipSchool: { findMany: (...a: unknown[]) => championshipSchoolFindMany(...a), findFirst: async () => ({ schoolAccount: { schoolName: "Mock Kondele Primary" } }) },
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

const { DELETE: deleteLearner } = await import("@/app/api/learners/[id]/route");
const { AuthorizationError } = await import("@/lib/authorize");

const LEARNER = "44444444-4444-4444-4444-444444444444";
const params = { params: Promise.resolve({ id: LEARNER }) };
const remove = () => deleteLearner(new Request("http://localhost/x", { method: "DELETE" }), params);

/** The school's own account: not an official, but its learners' editor. */
function asSchool() {
  requireChampionshipAccess.mockRejectedValue(new AuthorizationError("You do not have access to this championship"));
  getAuthContext.mockResolvedValue({ userId: "school-1", roles: [] });
}

beforeEach(() => {
  vi.clearAllMocks();
  learnerFindUnique.mockResolvedValue({ id: LEARNER, championshipId: "c1", schoolId: "s1", firstName: "Jane", lastName: "Adongo", bibNumber: 2 });
  championshipFindUnique.mockResolvedValue({ registrationClosesAt: null, endDate: new Date("2999-01-01") });
  championshipSchoolFindMany.mockResolvedValue([{ schoolId: "s1" }]);
  challengeFindFirst.mockResolvedValue(null);
  participantFindMany.mockResolvedValue([{ id: "p1", gameId: "g1", tournamentTeamId: null }]);
  participantFindFirst.mockResolvedValue(null);
  heatFindFirst.mockResolvedValue(null);
  teamFindUnique.mockResolvedValue(null);
  txLearnerDelete.mockResolvedValue({ id: LEARNER });
  asSchool();
});

describe("deleting a learner", () => {
  it("lets the school delete its learner, with their entries", async () => {
    const res = await remove();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true, entriesRemoved: 1 });
    expect(txParticipantDeleteMany).toHaveBeenCalledWith({ where: { learnerId: LEARNER } });
    expect(txLearnerDelete).toHaveBeenCalledWith({ where: { id: LEARNER }, select: { id: true } });
  });

  it("refuses another school's learner", async () => {
    championshipSchoolFindMany.mockResolvedValue([{ schoolId: "other" }]);
    expect((await remove()).status).toBe(403);
    expect(txLearnerDelete).not.toHaveBeenCalled();
  });

  it("holds a learner entered in an event that has been seeded", async () => {
    heatFindFirst.mockResolvedValue({ id: "heat-1" });
    const res = await remove();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/seeded/);
    expect(txLearnerDelete).not.toHaveBeenCalled();
  });

  it("holds a learner on an approved team's list", async () => {
    participantFindMany.mockResolvedValue([{ id: "p1", gameId: "g1", tournamentTeamId: "t1" }]);
    teamFindUnique.mockResolvedValue({ name: "Mock Kondele Primary", approvedAt: new Date() });
    expect((await remove()).status).toBe(403);
    expect(txLearnerDelete).not.toHaveBeenCalled();
  });

  it("never deletes a disqualified or challenged learner", async () => {
    challengeFindFirst.mockResolvedValue({ status: "UPHELD" });
    const upheld = await remove();
    expect(upheld.status).toBe(409);
    expect((await upheld.json()).error).toMatch(/disqualified/);
    challengeFindFirst.mockResolvedValue({ status: "OPEN" });
    expect((await remove()).status).toBe(409);
    expect(txLearnerDelete).not.toHaveBeenCalled();
  });

  it("stops the school after the registration deadline", async () => {
    championshipFindUnique.mockResolvedValue({ registrationClosesAt: new Date("2020-01-01"), endDate: new Date("2999-01-01") });
    expect((await remove()).status).toBe(403);
    expect(txLearnerDelete).not.toHaveBeenCalled();
  });

  it("lets a tournament admin delete past a lock", async () => {
    requireChampionshipAccess.mockResolvedValue({ userId: "admin-1" });
    heatFindFirst.mockResolvedValue({ id: "heat-1" });
    expect((await remove()).status).toBe(200);
    expect(txLearnerDelete).toHaveBeenCalled();
  });
});
