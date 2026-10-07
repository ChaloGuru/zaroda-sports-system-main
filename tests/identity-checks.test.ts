import { describe, it, expect, vi, beforeEach } from "vitest";

const learnerFindUnique = vi.fn();
const learnerFindMany = vi.fn();
const alertFindMany = vi.fn();
const alertCreate = vi.fn();
const alertUpdate = vi.fn();
const alertDelete = vi.fn();
const challengeFindFirst = vi.fn();
const challengeFindUnique = vi.fn();
const participantFindUnique = vi.fn();
const userFindUnique = vi.fn();
const txParticipantUpdateMany = vi.fn();
const txChallengeCreate = vi.fn();
const txChallengeUpdate = vi.fn();
const requireChampionshipAccess = vi.fn();

vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/authorize", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authorize")>("@/lib/authorize");
  return {
    ...actual,
    requireChampionshipAccess: (...a: unknown[]) => requireChampionshipAccess(...a),
    requireGameAccess: vi.fn().mockResolvedValue({ userId: "official-1", email: "o@x.ke" }),
  };
});
const tx = {
  participant: { updateMany: (...a: unknown[]) => txParticipantUpdateMany(...a), update: vi.fn() },
  learnerChallenge: { create: (...a: unknown[]) => txChallengeCreate(...a), update: (...a: unknown[]) => txChallengeUpdate(...a) },
  auditLog: { create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    learner: { findUnique: (...a: unknown[]) => learnerFindUnique(...a), findMany: (...a: unknown[]) => learnerFindMany(...a) },
    learnerIdentityAlert: {
      findMany: (...a: unknown[]) => alertFindMany(...a),
      create: (...a: unknown[]) => alertCreate(...a),
      update: (...a: unknown[]) => alertUpdate(...a),
      delete: (...a: unknown[]) => alertDelete(...a),
    },
    learnerChallenge: { findFirst: (...a: unknown[]) => challengeFindFirst(...a), findUnique: (...a: unknown[]) => challengeFindUnique(...a) },
    participant: { findUnique: (...a: unknown[]) => participantFindUnique(...a) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

const {
  compareIdentities,
  descriptorToBytes,
  findIdentityAlerts,
  namesAgree,
  refreshIdentityAlerts,
} = await import("@/lib/identity-checks");
const { POST: raiseChallenge } = await import("@/app/api/learners/[id]/challenges/route");
const { PATCH: resolveChallenge } = await import("@/app/api/learner-challenges/[id]/route");
const { PATCH: patchParticipant } = await import("@/app/api/participants/[id]/route");

/** A face descriptor: `seed` picks the face, `nudge` moves it a little (same child, another photo). */
function face(seed: number, nudge = 0): Buffer {
  const values = Array.from({ length: 128 }, (_, i) => Math.sin(seed * 31 + i) * 0.1 + (i === 0 ? nudge : 0));
  return descriptorToBytes(values)!;
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "a",
    firstName: "Brian",
    lastName: "Otieno",
    gender: "BOYS",
    dateOfBirth: new Date("2014-03-02"),
    birthCertNumber: "123456",
    knecAssessmentNumber: null,
    kemisUpi: null,
    faceDescriptor: null,
    ...overrides,
  } as Parameters<typeof findIdentityAlerts>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  requireChampionshipAccess.mockResolvedValue({ userId: "official-1", email: "o@x.ke" });
  userFindUnique.mockResolvedValue({ name: "Jane Wanjiru" });
});

describe("comparing two learner records", () => {
  it("treats the same names in another order as one child, but not siblings sharing a surname", () => {
    expect(namesAgree({ firstName: "Brian", lastName: "Otieno" }, { firstName: "Otieno", lastName: "Brian Ouma" })).toBe(true);
    expect(namesAgree({ firstName: "Brian", lastName: "Otieno" }, { firstName: "Kevin", lastName: "Otieno" })).toBe(false);
  });

  it("says nothing about the same child's records", () => {
    const a = record({ faceDescriptor: face(1) });
    const b = record({ id: "b", faceDescriptor: face(1, 0.05) });
    expect(findIdentityAlerts(a, b)).toEqual([]);
  });

  it("flags a birth certificate used with another date of birth and name", () => {
    const younger = record({ firstName: "Kevin", dateOfBirth: new Date("2016-08-10") });
    const alerts = findIdentityAlerts(record(), { ...younger, id: "b" });
    expect(alerts).toEqual([{ kind: "ID_MISMATCH", details: { shared: ["birthCertNumber"], differences: ["name", "dateOfBirth"] } }]);
  });

  it("flags the same birth certificate under a different child's face", () => {
    const alerts = findIdentityAlerts(record({ faceDescriptor: face(1) }), record({ id: "b", faceDescriptor: face(7) }));
    expect(alerts.map((a) => a.kind)).toEqual(["DIFFERENT_FACE"]);
  });

  it("flags one face registered under two identities", () => {
    const lastSeason = record({ faceDescriptor: face(3), birthCertNumber: "999", firstName: "Kevin", dateOfBirth: new Date("2011-01-01") });
    const now = record({ id: "b", faceDescriptor: face(3, 0.05), birthCertNumber: "123456" });
    const alerts = findIdentityAlerts(lastSeason, now);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.kind).toBe("SAME_FACE");
    expect(alerts[0]!.details.differences).toEqual(["birthCertNumber", "name", "dateOfBirth"]);
  });

  it("notes a different KNEC number on records sharing a birth certificate", () => {
    const { shared, differences } = compareIdentities(
      record({ knecAssessmentNumber: "A1" }),
      record({ id: "b", knecAssessmentNumber: "B2" }),
    );
    expect(shared).toEqual(["birthCertNumber"]);
    expect(differences).toEqual(["knecAssessmentNumber"]);
  });

  it("only stores descriptors of 128 sensible numbers", () => {
    expect(descriptorToBytes([1, 2, 3])).toBeNull();
    expect(descriptorToBytes(Array(128).fill(Number.NaN))).toBeNull();
    expect(descriptorToBytes(Array(128).fill(0.1))?.byteLength).toBe(512);
  });
});

describe("refreshing a learner's identity alerts", () => {
  it("creates new alerts, keeps unchanged ones and removes ones that no longer apply", async () => {
    learnerFindUnique.mockResolvedValue({ ...record({ id: "m" }), championshipId: "c1", championship: { tenantId: "t1" } });
    learnerFindMany.mockResolvedValueOnce([record({ id: "z", dateOfBirth: new Date("2016-01-01") })]);
    alertFindMany.mockResolvedValue([
      { id: "gone", learnerAId: "a0", learnerBId: "m", kind: "ID_MISMATCH", details: {} },
    ]);
    await refreshIdentityAlerts({ learner: { findUnique: learnerFindUnique, findMany: learnerFindMany }, learnerIdentityAlert: { findMany: alertFindMany, create: alertCreate, update: alertUpdate, delete: alertDelete } } as never, "m");
    // ID numbers are looked up across every championship.
    expect(learnerFindMany.mock.calls[0]![0].where).toEqual({ id: { not: "m" }, OR: [{ birthCertNumber: "123456" }] });
    expect(alertDelete).toHaveBeenCalledWith({ where: { id: "gone" } });
    expect(alertCreate).toHaveBeenCalledWith({
      data: { learnerAId: "m", learnerBId: "z", kind: "ID_MISMATCH", details: { shared: ["birthCertNumber"], differences: ["dateOfBirth"] } },
    });
  });
});

const LEARNER = "44444444-4444-4444-4444-444444444444";
const params = { params: Promise.resolve({ id: LEARNER }) };
function json(body: unknown, method = "POST") {
  return new Request("http://localhost/x", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("challenging a learner", () => {
  it("holds the learner back: any check-in is undone", async () => {
    learnerFindUnique.mockResolvedValue({ id: LEARNER, championshipId: "c1" });
    challengeFindFirst.mockResolvedValue(null);
    txChallengeCreate.mockImplementation(({ data }) => ({ id: "ch1", ...data }));
    const res = await raiseChallenge(json({ reason: "Looks much older than 13" }), params);
    expect(res.status).toBe(201);
    expect(txParticipantUpdateMany).toHaveBeenCalledWith({
      where: { learnerId: LEARNER, status: "CONFIRMED_IN_CALL_ROOM" },
      data: { status: "REGISTERED" },
    });
    expect(txChallengeCreate).toHaveBeenCalledWith({ data: { learnerId: LEARNER, reason: "Looks much older than 13", raisedBy: "Jane Wanjiru" } });
  });

  it("refuses a second open challenge", async () => {
    learnerFindUnique.mockResolvedValue({ id: LEARNER, championshipId: "c1" });
    challengeFindFirst.mockResolvedValue({ id: "ch1" });
    expect((await raiseChallenge(json({ reason: "Looks much older than 13" }), params)).status).toBe(409);
  });

  it("won't check in a challenged learner", async () => {
    participantFindUnique.mockResolvedValue({ id: "p1", gameId: "g1", championshipId: "c1", learnerId: LEARNER, tournamentTeamId: null });
    challengeFindFirst.mockResolvedValue({ status: "OPEN" });
    const res = await patchParticipant(json({ status: "CONFIRMED_IN_CALL_ROOM" }, "PATCH"), { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/challenged/);
  });

  it("disqualifies every entry when an admin upholds it", async () => {
    challengeFindUnique.mockResolvedValue({ id: "ch1", status: "OPEN", learnerId: LEARNER, learner: { id: LEARNER, championshipId: "c1" } });
    txChallengeUpdate.mockImplementation(({ data }) => ({ id: "ch1", ...data }));
    const res = await resolveChallenge(json({ status: "UPHELD", resolution: "Birth certificate is his younger brother's" }, "PATCH"), {
      params: Promise.resolve({ id: "ch1" }),
    });
    expect(res.status).toBe(200);
    expect(requireChampionshipAccess).toHaveBeenCalledWith("c1", ["TOURNAMENT_ADMIN"]);
    expect(txParticipantUpdateMany).toHaveBeenCalledWith({ where: { learnerId: LEARNER }, data: { status: "DISQUALIFIED" } });
  });

  it("clears without touching the entries", async () => {
    challengeFindUnique.mockResolvedValue({ id: "ch1", status: "OPEN", learnerId: LEARNER, learner: { id: LEARNER, championshipId: "c1" } });
    txChallengeUpdate.mockImplementation(({ data }) => ({ id: "ch1", ...data }));
    await resolveChallenge(json({ status: "CLEARED", resolution: "Originals seen - they match" }, "PATCH"), { params: Promise.resolve({ id: "ch1" }) });
    expect(txParticipantUpdateMany).not.toHaveBeenCalled();
  });
});
