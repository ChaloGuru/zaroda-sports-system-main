import { describe, it, expect, vi, beforeEach } from "vitest";

const gameFindUnique = vi.fn();
const championshipFindUnique = vi.fn();
const championshipSchoolFindUnique = vi.fn();
const bibRangeFindUnique = vi.fn();
const learnerFindUnique = vi.fn();
const learnerFindFirst = vi.fn();
const learnerFindMany = vi.fn();
const participantFindFirst = vi.fn();
const participantFindMany = vi.fn();
const participantFindUnique = vi.fn();
const participantCount = vi.fn();
const participantDelete = vi.fn();
const heatFindFirst = vi.fn();
const teamFindUnique = vi.fn();
const teamUpdate = vi.fn();
const challengeFindFirst = vi.fn().mockResolvedValue(null);
const txLearnerCount = vi.fn();
const txLearnerCreate = vi.fn();
const txParticipantCreate = vi.fn();
const txExecuteRaw = vi.fn();
const requireChampionshipAccess = vi.fn();

vi.mock("@/lib/authorize", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authorize")>("@/lib/authorize");
  return {
    ...actual,
    requireGameAccess: vi.fn().mockResolvedValue({ userId: "official-1", roles: [] }),
    requireTeamAccess: vi.fn().mockResolvedValue({ userId: "teacher-1", roles: [] }),
    requireChampionshipAccess: (...a: unknown[]) => requireChampionshipAccess(...a),
  };
});
vi.mock("@/lib/learner-access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/learner-access")>("@/lib/learner-access");
  return { ...actual, actorName: vi.fn().mockResolvedValue("Jane Official") };
});
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

const txClient = {
  $executeRaw: (...a: unknown[]) => txExecuteRaw(...a),
  school: { findUnique: async () => ({ name: "Manyonge" }) },
  learner: { count: (...a: unknown[]) => txLearnerCount(...a), create: (...a: unknown[]) => txLearnerCreate(...a) },
  participant: { create: (...a: unknown[]) => txParticipantCreate(...a), delete: (...a: unknown[]) => participantDelete(...a) },
  tournamentTeam: { update: (...a: unknown[]) => teamUpdate(...a) },
  auditLog: { create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    game: { findUnique: (...a: unknown[]) => gameFindUnique(...a) },
    championshipSchool: { findUnique: (...a: unknown[]) => championshipSchoolFindUnique(...a) },
    championship: { findUnique: (...a: unknown[]) => championshipFindUnique(...a) },
    schoolBibRange: { findUnique: (...a: unknown[]) => bibRangeFindUnique(...a) },
    tournamentTeam: { findUnique: (...a: unknown[]) => teamFindUnique(...a) },
    school: { findUnique: async () => ({ name: "Manyonge", schoolLevel: "PRIMARY" }) },
    heat: { findFirst: (...a: unknown[]) => heatFindFirst(...a) },
    learner: {
      findUnique: (...a: unknown[]) => learnerFindUnique(...a),
      findFirst: (...a: unknown[]) => learnerFindFirst(...a),
      findMany: (...a: unknown[]) => learnerFindMany(...a),
    },
    participant: {
      findFirst: (...a: unknown[]) => participantFindFirst(...a),
      findMany: (...a: unknown[]) => participantFindMany(...a),
      findUnique: (...a: unknown[]) => participantFindUnique(...a),
      count: (...a: unknown[]) => participantCount(...a),
    },
    learnerChallenge: { findFirst: (...a: unknown[]) => challengeFindFirst(...a) },
    $transaction: (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient),
  },
}));

const { POST } = await import("@/app/api/participants/route");
const { POST: registerLearner } = await import("@/app/api/learners/route");
const { DELETE: removeEntry } = await import("@/app/api/participants/[id]/route");
const { POST: setApproval } = await import("@/app/api/tournament-teams/[id]/approval/route");

const CHAMP = "11111111-1111-1111-1111-111111111111";
const GAME = "22222222-2222-2222-2222-222222222222";
const OTHER_GAME = "66666666-6666-6666-6666-666666666666";
const SCHOOL = "33333333-3333-3333-3333-333333333333";
const LEARNER = "44444444-4444-4444-4444-444444444444";
const TEAM = "55555555-5555-5555-5555-555555555555";

const notAdmin = () => requireChampionshipAccess.mockRejectedValue(new Error("not an admin"));

function post(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/participants", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ championshipId: CHAMP, gameId: GAME, ...body }),
  });
}

const existingLearner = (body: Record<string, unknown> = {}) => post({ learnerId: LEARNER, ...body });
const newLearner = () => post({ schoolId: SCHOOL, firstName: "Amina", lastName: "Otieno", gender: "GIRLS" });

function approval(approved: boolean): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost/api/tournament-teams/${TEAM}/approval`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approved }),
    }),
    { params: Promise.resolve({ id: TEAM }) },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  requireChampionshipAccess.mockReset();
  requireChampionshipAccess.mockResolvedValue({ userId: "admin-1", roles: [] });
  gameFindUnique.mockResolvedValue({ championshipId: CHAMP, schoolLevel: "PRIMARY", name: "100m" });
  championshipFindUnique.mockResolvedValue({
    level: "NATIONAL",
    county: "Kisumu",
    startDate: new Date("2026-06-01"),
    ageCutoffDate: null,
    registrationClosesAt: null,
    ageLimits: [],
  });
  championshipSchoolFindUnique.mockResolvedValue({ school: { name: "Manyonge", county: "Kisumu", schoolLevel: "PRIMARY" } });
  bibRangeFindUnique.mockResolvedValue({ schoolId: SCHOOL, rangeStart: 100, rangeEnd: 399 });
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
  learnerFindMany.mockResolvedValue([]);
  participantFindFirst.mockResolvedValue(null);
  participantFindMany.mockResolvedValue([]);
  heatFindFirst.mockResolvedValue(null);
  teamFindUnique.mockResolvedValue({ id: TEAM, name: "Manyonge", championshipId: CHAMP, schoolId: SCHOOL, gameId: GAME, approvedAt: null, approvedBy: null });
  txLearnerCount.mockResolvedValue(0);
  txLearnerCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: LEARNER, ...data }));
  txParticipantCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: "entry-1", ...data }));
});

describe("after registration closes", () => {
  beforeEach(() => {
    notAdmin();
    championshipFindUnique.mockResolvedValue({
      level: "NATIONAL",
      county: "Kisumu",
      startDate: new Date("2026-06-01"),
      ageCutoffDate: null,
      registrationClosesAt: new Date("2026-01-01T00:00:00Z"),
      ageLimits: [],
    });
  });

  it("still lets a registered learner be assigned to an event", async () => {
    expect((await POST(existingLearner())).status).toBe(201);
    expect(txParticipantCreate).toHaveBeenCalled();
  });

  it("can't create a school entry without a registered learner", async () => {
    const res = await POST(newLearner());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Register this learner with their photo first, then enter them");
    expect(txLearnerCreate).not.toHaveBeenCalled();
    expect(txParticipantCreate).not.toHaveBeenCalled();
  });
});

describe("individual events", () => {
  it("lock once seeded in the call room", async () => {
    notAdmin();
    heatFindFirst.mockResolvedValue({ id: "heat-1" });
    const res = await POST(existingLearner());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("This event has been seeded in the call room, so its entries are locked");
    expect(txParticipantCreate).not.toHaveBeenCalled();
  });

  it("lock at the first result when the event never gets a heat", async () => {
    notAdmin();
    participantFindFirst.mockImplementation(async (args: { where: { OR?: unknown } }) => (args.where.OR ? { id: "scored" } : null));
    const res = await POST(existingLearner());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("This event has started, so its entries are locked");
  });

  it("stay open until then", async () => {
    notAdmin();
    expect((await POST(existingLearner())).status).toBe(201);
  });

  it("let a learner enter another event when one of theirs is locked", async () => {
    notAdmin();
    heatFindFirst.mockImplementation(async (args: { where: { gameId: string } }) => (args.where.gameId === GAME ? { id: "heat-1" } : null));
    expect((await POST(existingLearner())).status).toBe(403);
    expect((await POST(existingLearner({ gameId: OTHER_GAME }))).status).toBe(201);
  });

  it("can still be corrected by a tournament admin", async () => {
    heatFindFirst.mockResolvedValue({ id: "heat-1" });
    expect((await POST(existingLearner())).status).toBe(201);
  });
});

describe("teams", () => {
  const approved = { id: TEAM, name: "Manyonge", championshipId: CHAMP, schoolId: SCHOOL, gameId: GAME, approvedAt: new Date(), approvedBy: "Jane Official" };

  it("take players until vetted and approved", async () => {
    notAdmin();
    expect((await POST(existingLearner({ tournamentTeamId: TEAM }))).status).toBe(201);
  });

  it("lock once approved", async () => {
    notAdmin();
    teamFindUnique.mockResolvedValue(approved);
    const res = await POST(existingLearner({ tournamentTeamId: TEAM }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("has been vetted and approved");
  });

  it("don't let a team manager remove a player once approved", async () => {
    notAdmin();
    teamFindUnique.mockResolvedValue(approved);
    participantFindUnique.mockResolvedValue({ id: "entry-1", championshipId: CHAMP, gameId: GAME, tournamentTeamId: TEAM });
    const res = await removeEntry(new Request("http://localhost/api/participants/entry-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "entry-1" }),
    });
    expect(res.status).toBe(403);
    expect(participantDelete).not.toHaveBeenCalled();
  });

  it("don't stop their players entering other activities", async () => {
    notAdmin();
    teamFindUnique.mockResolvedValue(approved);
    expect((await POST(existingLearner({ gameId: OTHER_GAME }))).status).toBe(201);
  });
});

describe("approving a team", () => {
  it("records who approved it", async () => {
    participantCount.mockResolvedValue(11);
    const res = await setApproval(...approval(true));
    expect(res.status).toBe(200);
    expect(teamUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TEAM }, data: { approvedAt: expect.any(Date), approvedBy: "Jane Official" } }),
    );
  });

  it("refuses a team with no players", async () => {
    participantCount.mockResolvedValue(0);
    expect((await setApproval(...approval(true))).status).toBe(400);
    expect(teamUpdate).not.toHaveBeenCalled();
  });

  it("can be withdrawn", async () => {
    expect((await setApproval(...approval(false))).status).toBe(200);
    expect(teamUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { approvedAt: null, approvedBy: null } }));
  });
});

describe("the 200 learner limit", () => {
  it("allows the 200th learner", async () => {
    txLearnerCount.mockResolvedValue(199);
    expect((await registerLearner(newLearner())).status).toBe(201);
  });

  it("refuses the 201st learner", async () => {
    txLearnerCount.mockResolvedValue(200);
    const res = await registerLearner(newLearner());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Manyonge has reached the limit of 200 registered learners");
    expect(txLearnerCreate).not.toHaveBeenCalled();
  });

  it("counts a school's Primary and JS entries together", async () => {
    await registerLearner(newLearner());
    expect(txLearnerCount).toHaveBeenCalledWith({
      where: { championshipId: CHAMP, school: { name: { equals: "Manyonge", mode: "insensitive" } } },
    });
  });

  it("takes a lock so two registrations can't both take the last place", async () => {
    await registerLearner(newLearner());
    expect(txExecuteRaw.mock.invocationCallOrder[0]).toBeLessThan(txLearnerCount.mock.invocationCallOrder[0] as number);
  });

  it("doesn't count against a registered learner entering more events", async () => {
    txLearnerCount.mockResolvedValue(200);
    expect((await POST(existingLearner())).status).toBe(201);
  });
});
