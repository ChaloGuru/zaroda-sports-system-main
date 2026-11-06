import { describe, it, expect, vi, beforeEach } from "vitest";

const gameFindUnique = vi.fn();
const championshipFindUnique = vi.fn();
const championshipSchoolFindUnique = vi.fn();
const learnerFindUnique = vi.fn();
const learnerFindFirst = vi.fn();
const participantFindFirst = vi.fn();
const participantFindUnique = vi.fn();
const participantDelete = vi.fn();
const heatFindFirst = vi.fn();
const txLearnerCount = vi.fn();
const txLearnerCreate = vi.fn();
const txParticipantCreate = vi.fn();
const requireGameAccess = vi.fn();
const requireChampionshipAccess = vi.fn();
const getAuthContext = vi.fn();
const managedTeamSchoolIds = vi.fn();

vi.mock("@/lib/authorize", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authorize")>("@/lib/authorize");
  return {
    ...actual,
    requireGameAccess: (...a: unknown[]) => requireGameAccess(...a),
    requireChampionshipAccess: (...a: unknown[]) => requireChampionshipAccess(...a),
    getAuthContext: (...a: unknown[]) => getAuthContext(...a),
    managedTeamSchoolIds: (...a: unknown[]) => managedTeamSchoolIds(...a),
    ownSchoolIds: (...a: unknown[]) => managedTeamSchoolIds(...a),
  };
});
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

const txClient = {
  $executeRaw: async () => 0,
  school: { findUnique: async () => ({ name: "Manyonge" }) },
  learner: { count: (...a: unknown[]) => txLearnerCount(...a), create: (...a: unknown[]) => txLearnerCreate(...a) },
  participant: { create: (...a: unknown[]) => txParticipantCreate(...a), delete: (...a: unknown[]) => participantDelete(...a) },
  auditLog: { create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    game: { findUnique: (...a: unknown[]) => gameFindUnique(...a) },
    championshipSchool: { findUnique: (...a: unknown[]) => championshipSchoolFindUnique(...a) },
    championship: { findUnique: (...a: unknown[]) => championshipFindUnique(...a) },
    schoolBibRange: { findUnique: async () => ({ schoolId: "s", rangeStart: 100, rangeEnd: 399 }) },
    school: { findUnique: async () => ({ name: "Manyonge", schoolLevel: "PRIMARY" }) },
    heat: { findFirst: (...a: unknown[]) => heatFindFirst(...a) },
    learner: {
      findUnique: (...a: unknown[]) => learnerFindUnique(...a),
      findFirst: (...a: unknown[]) => learnerFindFirst(...a),
      findMany: async () => [],
    },
    participant: {
      findFirst: (...a: unknown[]) => participantFindFirst(...a),
      findMany: async () => [],
      findUnique: (...a: unknown[]) => participantFindUnique(...a),
    },
    learnerChallenge: { findFirst: async () => null },
    learnerIdentityAlert: { findMany: async () => [] },
    $transaction: (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient),
  },
}));

const { AuthorizationError } = await import("@/lib/authorize");
const { POST: registerLearner } = await import("@/app/api/learners/route");
const { POST: enterLearner } = await import("@/app/api/participants/route");
const { DELETE: removeEntry } = await import("@/app/api/participants/[id]/route");

const CHAMP = "11111111-1111-1111-1111-111111111111";
const RACE = "22222222-2222-2222-2222-222222222222";
const SCHOOL = "33333333-3333-3333-3333-333333333333";
const OTHER_SCHOOL = "77777777-7777-7777-7777-777777777777";
const LEARNER = "44444444-4444-4444-4444-444444444444";

const teacher = { userId: "teacher-1", roles: [] };

function json(url: string, body: Record<string, unknown>): Request {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const register = (body: Record<string, unknown> = {}) =>
  registerLearner(
    json("/api/learners", { championshipId: CHAMP, schoolId: SCHOOL, firstName: "Amina", lastName: "Otieno", gender: "GIRLS", ...body }),
  );
const enter = () => enterLearner(json("/api/participants", { championshipId: CHAMP, gameId: RACE, learnerId: LEARNER }));
const remove = () =>
  removeEntry(new Request("http://localhost/api/participants/entry-1", { method: "DELETE" }), { params: Promise.resolve({ id: "entry-1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  requireGameAccess.mockReset().mockRejectedValue(new AuthorizationError("not an official"));
  requireChampionshipAccess.mockReset().mockRejectedValue(new AuthorizationError("not an official"));
  getAuthContext.mockResolvedValue(teacher);
  managedTeamSchoolIds.mockResolvedValue([SCHOOL]);
  gameFindUnique.mockResolvedValue({ championshipId: CHAMP, schoolLevel: "PRIMARY", name: "100m", category: "ATHLETICS" });
  championshipFindUnique.mockResolvedValue({ startDate: new Date("2026-06-01"), ageCutoffDate: null, registrationClosesAt: null, ageLimits: [] });
  championshipSchoolFindUnique.mockResolvedValue({ school: { name: "Manyonge", county: "Kisumu", schoolLevel: "PRIMARY" } });
  learnerFindUnique.mockResolvedValue({
    id: LEARNER,
    championshipId: CHAMP,
    schoolId: SCHOOL,
    firstName: "Amina",
    lastName: "Otieno",
    gender: "GIRLS",
    dateOfBirth: null,
    bibNumber: 100,
    photoUpdatedAt: new Date(),
    school: { name: "Manyonge", schoolLevel: "PRIMARY" },
  });
  learnerFindFirst.mockResolvedValue(null);
  participantFindFirst.mockResolvedValue(null);
  heatFindFirst.mockResolvedValue(null);
  txLearnerCount.mockResolvedValue(0);
  txLearnerCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: LEARNER, ...data }));
  txParticipantCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: "entry-1", ...data }));
});

describe("a teacher registering a learner", () => {
  it("doesn't need to choose an event", async () => {
    const res = await register({ birthCertNumber: "ab 12" });
    expect(res.status).toBe(201);
    expect(txLearnerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ schoolId: SCHOOL, firstName: "Amina", birthCertNumber: "AB12", bibNumber: expect.any(Number) }),
      }),
    );
    expect(txParticipantCreate).not.toHaveBeenCalled();
  });

  const overAge = { dateOfBirth: "2000-01-01" };
  const limits = (schoolLevel: string, championshipLevel: string) => ({
    schoolLevel: championshipLevel,
    startDate: new Date("2026-06-01"),
    ageCutoffDate: null,
    registrationClosesAt: null,
    ageLimits: [{ schoolLevel, maxAge: 14 }],
  });

  it("is held to the age limit of the Primary or JS entry", async () => {
    championshipFindUnique.mockResolvedValue(limits("PRIMARY", "PRIMARY_JS"));
    expect((await register(overAge)).status).toBe(400);
    expect(txLearnerCreate).not.toHaveBeenCalled();
  });

  it("isn't held to the other level's limit", async () => {
    championshipFindUnique.mockResolvedValue(limits("JS", "PRIMARY_JS"));
    expect((await register(overAge)).status).toBe(201);
  });

  it("is held to the championship's age limit where schools aren't split", async () => {
    championshipSchoolFindUnique.mockResolvedValue({ school: { name: "Manyonge", county: "Kisumu", schoolLevel: null } });
    championshipFindUnique.mockResolvedValue(limits("SENIOR_SCHOOL", "SENIOR_SCHOOL"));
    expect((await register(overAge)).status).toBe(400);
    expect(txLearnerCreate).not.toHaveBeenCalled();
  });

  it("can't register for another school", async () => {
    expect((await register({ schoolId: OTHER_SCHOOL })).status).toBe(403);
    expect(txLearnerCreate).not.toHaveBeenCalled();
  });

  it("can't register after the deadline", async () => {
    championshipFindUnique.mockResolvedValue({ registrationClosesAt: new Date("2026-01-01T00:00:00Z") });
    expect((await register()).status).toBe(403);
    expect(txLearnerCreate).not.toHaveBeenCalled();
  });

  it("can't go over the school's limit", async () => {
    txLearnerCount.mockResolvedValue(200);
    const res = await register();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Manyonge has reached the limit of 200 registered learners");
  });

  it("can't register the same learner twice", async () => {
    learnerFindFirst.mockResolvedValue({ bibNumber: 101, dateOfBirth: null });
    expect((await register()).status).toBe(400);
    expect(txLearnerCreate).not.toHaveBeenCalled();
  });

  it("must say boy or girl", async () => {
    expect((await register({ gender: "MIXED" })).status).toBe(400);
  });

  it("is refused when the school isn't in the championship", async () => {
    championshipSchoolFindUnique.mockResolvedValue(null);
    expect((await register()).status).toBe(400);
    expect(txLearnerCreate).not.toHaveBeenCalled();
  });
});

describe("a teacher assigning learners to races", () => {
  it("can enter their own school's learner", async () => {
    expect((await enter()).status).toBe(201);
    expect(txParticipantCreate).toHaveBeenCalled();
  });

  it("can't enter another school's learner", async () => {
    managedTeamSchoolIds.mockResolvedValue([OTHER_SCHOOL]);
    expect((await enter()).status).toBe(403);
    expect(txParticipantCreate).not.toHaveBeenCalled();
  });

  it("can't enter a learner in a ball game outside a team", async () => {
    gameFindUnique.mockResolvedValue({ championshipId: CHAMP, schoolLevel: "PRIMARY", name: "Football", category: "BALL_GAMES" });
    expect((await enter()).status).toBe(403);
    expect(txParticipantCreate).not.toHaveBeenCalled();
  });

  it("records the learner's personal best", async () => {
    const res = await enterLearner(json("/api/participants", { championshipId: CHAMP, gameId: RACE, learnerId: LEARNER, personalBest: "12.06" }));
    expect(res.status).toBe(201);
    expect(txParticipantCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ personalBest: 12.06 }) });
  });

  it("can't enter a learner with no photo", async () => {
    learnerFindUnique.mockResolvedValue({ ...(await learnerFindUnique()), photoUpdatedAt: null });
    const res = await enter();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Add Amina Otieno's photo before entering them in an event");
    expect(txParticipantCreate).not.toHaveBeenCalled();
  });

  it("is stopped once the race is seeded", async () => {
    heatFindFirst.mockResolvedValue({ id: "heat-1" });
    expect((await enter()).status).toBe(403);
    expect(txParticipantCreate).not.toHaveBeenCalled();
  });
});

describe("a teacher removing a learner from a race", () => {
  const entry = { id: "entry-1", championshipId: CHAMP, gameId: RACE, schoolId: SCHOOL, tournamentTeamId: null };

  beforeEach(() => participantFindUnique.mockResolvedValue(entry));

  it("can remove their own school's learner", async () => {
    expect((await remove()).status).toBe(200);
    expect(participantDelete).toHaveBeenCalled();
  });

  it("can't remove another school's learner", async () => {
    participantFindUnique.mockResolvedValue({ ...entry, schoolId: OTHER_SCHOOL });
    await remove();
    expect(participantDelete).not.toHaveBeenCalled();
  });

  it("can't remove anyone once the race is seeded", async () => {
    heatFindFirst.mockResolvedValue({ id: "heat-1" });
    expect((await remove()).status).toBe(403);
    expect(participantDelete).not.toHaveBeenCalled();
  });
});
