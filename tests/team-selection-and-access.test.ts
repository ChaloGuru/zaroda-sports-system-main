import { describe, it, expect, vi, beforeEach } from "vitest";

const gameFindUnique = vi.fn();
const gameFindFirst = vi.fn();
const participantFindMany = vi.fn();
const championshipFindUnique = vi.fn();
const learnerFindMany = vi.fn();
const teamFindMany = vi.fn();
const txTeamFindFirst = vi.fn();
const txTeamCreate = vi.fn();
const txLearnerFindFirst = vi.fn();
const txLearnerCreate = vi.fn();
const txParticipantFindFirst = vi.fn();
const txParticipantCreate = vi.fn();
const getAuthContext = vi.fn();

vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/authorize", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authorize")>("@/lib/authorize");
  return {
    ...actual,
    getAuthContext: (...a: unknown[]) => getAuthContext(...a),
    requireChampionshipAccess: vi.fn().mockResolvedValue({ userId: "admin-1" }),
  };
});

const tx = {
  tournamentTeam: { findFirst: txTeamFindFirst, create: txTeamCreate },
  learner: { findFirst: txLearnerFindFirst, create: txLearnerCreate },
  participant: { findFirst: txParticipantFindFirst, create: txParticipantCreate },
  auditLog: { create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    game: { findUnique: (...a: unknown[]) => gameFindUnique(...a), findFirst: (...a: unknown[]) => gameFindFirst(...a) },
    participant: { findMany: (...a: unknown[]) => participantFindMany(...a), findFirst: async () => null },
    championship: { findUnique: (...a: unknown[]) => championshipFindUnique(...a) },
    learner: { findMany: (...a: unknown[]) => learnerFindMany(...a), findFirst: async () => null },
    tournamentTeam: { findMany: (...a: unknown[]) => teamFindMany(...a) },
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

const { POST: promoteSelection } = await import("@/app/api/tournament-teams/promote-selection/route");
const { GET: listLearners } = await import("@/app/api/learners/route");

const ORIGIN_GAME = "11111111-1111-1111-1111-111111111111";
const TARGET = "22222222-2222-2222-2222-222222222222";
const P1 = "33333333-3333-3333-3333-333333333333";
const P2 = "44444444-4444-4444-4444-444444444444";

function selection(body: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/tournament-teams/promote-selection", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ gameId: ORIGIN_GAME, targetChampionshipId: TARGET, teamName: "Ososgo Zone", participantIds: [P1, P2], ...body }),
  });
}

function player(id: string, dateOfBirth: string, school: string) {
  const learner = {
    id: `l-${id}`, championshipId: "origin", schoolId: school, firstName: id, lastName: "X", gender: "BOYS",
    dateOfBirth: new Date(dateOfBirth), birthCertNumber: null, bibNumber: 5, photo: null, photoUpdatedAt: null, promotedFromLearnerId: null,
  };
  return { id, firstName: id, lastName: "X", gender: "BOYS", dateOfBirth: new Date(dateOfBirth), jerseyNumber: 7, playingPosition: null, learner };
}

describe("Primary ball games: picking the team that goes up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gameFindUnique.mockResolvedValue({ id: ORIGIN_GAME, championshipId: "origin", category: "BALL_GAMES", gender: "BOYS", schoolLevel: "PRIMARY", sport: "FOOTBALL", isTimed: false, name: "Football Boys" });
    gameFindFirst.mockResolvedValue({ id: "target-game", schoolLevel: "PRIMARY" });
    championshipFindUnique.mockResolvedValue({ startDate: new Date("2026-06-01"), ageCutoffDate: new Date("2026-01-01"), ageLimits: [{ schoolLevel: "PRIMARY", maxAge: 13 }] });
    txTeamFindFirst.mockResolvedValue(null);
    txTeamCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: "new-team", ...data }));
    txLearnerFindFirst.mockResolvedValue(null);
    txLearnerCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: `t-${String(data.firstName)}`, ...data }));
    txParticipantFindFirst.mockResolvedValue(null);
  });

  it("sends the picked players from different schools up as one team, leaving off anyone over age", async () => {
    participantFindMany.mockResolvedValue([player(P1, "2013-05-01", "school-a"), player(P2, "2011-05-01", "school-b")]);
    const res = await promoteSelection(selection());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ team: "Ososgo Zone", added: 1, alreadyIn: 0, overAge: 1 });
    expect(txTeamCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ name: "Ososgo Zone", gameId: "target-game" }) });
    // The player keeps their learner record (and school) at the next level.
    expect(txLearnerCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ schoolId: "school-a", promotedFromLearnerId: `l-${P1}` }) });
    expect(txParticipantCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ tournamentTeamId: "new-team", learnerId: `t-${P1}`, jerseyNumber: 7 }),
    });
  });

  it("adds to the team when it's already at the next level", async () => {
    participantFindMany.mockResolvedValue([player(P1, "2013-05-01", "school-a")]);
    txTeamFindFirst.mockResolvedValue({ id: "existing-team", name: "Ososgo Zone" });
    const res = await promoteSelection(selection({ participantIds: [P1] }));
    expect(res.status).toBe(200);
    expect(txTeamCreate).not.toHaveBeenCalled();
    expect(txParticipantCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ tournamentTeamId: "existing-team" }) });
  });

  it("refuses JS and Senior School games - those teams go up whole", async () => {
    gameFindUnique.mockResolvedValue({ id: ORIGIN_GAME, championshipId: "origin", schoolLevel: "JS", sport: "FOOTBALL", isTimed: false });
    const res = await promoteSelection(selection());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/go up whole/);
  });
});

describe("team managers and their school's learners", () => {
  const CHAMP = "55555555-5555-5555-5555-555555555555";
  function list(schoolId?: string) {
    return listLearners(new Request(`http://localhost/api/learners?championshipId=${CHAMP}${schoolId ? `&schoolId=${schoolId}` : ""}`));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    championshipFindUnique.mockResolvedValue({
      id: CHAMP, tenantId: "tenant", registrationClosesAt: null, ageCutoffDate: null, startDate: new Date("2026-06-01"), ageLimits: [],
    });
    learnerFindMany.mockResolvedValue([]);
    // Within the championship's dates, so the manager's role is active.
    getAuthContext.mockResolvedValue({ userId: "tm-1", roles: [{ role: "TEAM_MANAGER", championshipId: CHAMP, organizationName: "Manyonge Football" }] });
    teamFindMany.mockResolvedValue([{ schoolId: "manyonge" }]);
  });

  it("lets a team manager list their own school's learners", async () => {
    championshipFindUnique.mockResolvedValueOnce({
      id: CHAMP, tenantId: "tenant", registrationClosesAt: null, ageCutoffDate: null, startDate: new Date("2026-06-01"), ageLimits: [],
    }).mockResolvedValueOnce({ endDate: new Date("2999-01-01") });
    expect((await list("manyonge")).status).toBe(200);
  });

  it("lets officials list every learner", async () => {
    getAuthContext.mockResolvedValue({ userId: "sk-1", roles: [{ role: "SCOREKEEPER", championshipId: CHAMP }] });
    championshipFindUnique.mockResolvedValueOnce({
      id: CHAMP, tenantId: "tenant", registrationClosesAt: null, ageCutoffDate: null, startDate: new Date("2026-06-01"), ageLimits: [],
    }).mockResolvedValueOnce({ endDate: new Date("2999-01-01") });
    expect((await list()).status).toBe(200);
  });

  it("stops showing learners to an official once the championship has ended", async () => {
    getAuthContext.mockResolvedValue({ userId: "sk-1", roles: [{ role: "SCOREKEEPER", championshipId: CHAMP }] });
    championshipFindUnique.mockResolvedValueOnce({
      id: CHAMP, tenantId: "tenant", registrationClosesAt: null, ageCutoffDate: null, startDate: new Date("2026-06-01"), ageLimits: [],
    }).mockResolvedValueOnce({ endDate: new Date("2020-01-01") });
    expect((await list()).status).toBe(403);
  });

  it("refuses another school's learners, or the whole championship's", async () => {
    championshipFindUnique.mockResolvedValueOnce({
      id: CHAMP, tenantId: "tenant", registrationClosesAt: null, ageCutoffDate: null, startDate: new Date("2026-06-01"), ageLimits: [],
    }).mockResolvedValueOnce({ endDate: new Date("2999-01-01") });
    expect((await list("kisumu-boys")).status).toBe(403);
    expect((await list()).status).toBe(403);
  });
});
