import { describe, it, expect, vi, beforeEach } from "vitest";

const gameFindUnique = vi.fn();
const gameFindFirst = vi.fn();
const championshipFindUnique = vi.fn();
const tournamentTeamFindUnique = vi.fn();
const tournamentTeamFindFirst = vi.fn();
const tournamentTeamCreate = vi.fn();
const participantFindMany = vi.fn();
const participantFindFirst = vi.fn();
const participantCreate = vi.fn();
const auditLogCreate = vi.fn();
const requireChampionshipAccessMock = vi.fn();
const computeSingleGameStandingsMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    game: {
      findUnique: (...args: unknown[]) => gameFindUnique(...args),
      findFirst: (...args: unknown[]) => gameFindFirst(...args),
    },
    championship: { findUnique: (...args: unknown[]) => championshipFindUnique(...args) },
    tournamentTeam: {
      findUnique: (...args: unknown[]) => tournamentTeamFindUnique(...args),
      findFirst: (...args: unknown[]) => tournamentTeamFindFirst(...args),
    },
    participant: {
      findMany: (...args: unknown[]) => participantFindMany(...args),
      findFirst: (...args: unknown[]) => participantFindFirst(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        tournamentTeam: { create: (...args: unknown[]) => tournamentTeamCreate(...args) },
        participant: { create: (...args: unknown[]) => participantCreate(...args) },
        auditLog: { create: (...args: unknown[]) => auditLogCreate(...args) },
      }),
  },
}));

vi.mock("@/lib/authorize", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authorize")>("@/lib/authorize");
  return {
    ...actual,
    requireChampionshipAccess: (...args: unknown[]) => requireChampionshipAccessMock(...args),
  };
});

vi.mock("@/lib/team-standings", () => ({
  computeSingleGameStandings: (...args: unknown[]) => computeSingleGameStandingsMock(...args),
}));

const { POST } = await import("@/app/api/tournament-teams/promote/route");

function req(body: unknown): Request {
  return new Request("http://localhost/api/tournament-teams/promote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const GAME_ID = "11111111-1111-1111-1111-111111111111";
const TARGET_CHAMP_ID = "22222222-2222-2222-2222-222222222222";
const TARGET_GAME_ID = "33333333-3333-3333-3333-333333333333";
const TEAM_ID = "aaaaaaaa-0000-0000-0000-000000000001";

function originGame(schoolLevel = "JS") {
  return {
    id: GAME_ID,
    championshipId: "origin-champ-1",
    name: "Football Boys JS",
    category: "BALL_GAMES",
    gender: "BOYS",
    schoolLevel,
    isTimed: false,
    sport: "FOOTBALL",
    championship: { id: "origin-champ-1", name: "Oruba Base" },
  };
}

describe("POST /api/tournament-teams/promote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChampionshipAccessMock.mockResolvedValue({ userId: "user-1", email: "a@b.com", tenantId: "t1", roles: [] });
    tournamentTeamCreate.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "new-team-1", ...args.data }),
    );
    participantCreate.mockResolvedValue({ id: "new-participant-1" });
    tournamentTeamFindFirst.mockResolvedValue(null); // not already promoted
    participantFindMany.mockResolvedValue([]);
    participantFindFirst.mockResolvedValue(null); // no existing bib numbers
    gameFindFirst.mockResolvedValue({ id: TARGET_GAME_ID });
    championshipFindUnique.mockResolvedValue({ id: TARGET_CHAMP_ID, level: "ZONE", county: "Kisumu" });
    computeSingleGameStandingsMock.mockResolvedValue([{ teamId: TEAM_ID, teamName: "Kisangura", points: 9 }]);
  });

  it("renames a JS-level team to '{origin championship} - {team}' at the target level", async () => {
    gameFindUnique.mockResolvedValue(originGame("JS"));
    tournamentTeamFindUnique.mockResolvedValue({
      id: TEAM_ID,
      name: "Kisangura",
      gender: "BOYS",
      teamColor: "#ff0000",
      contactName: null,
      contactEmail: null,
      contactPhone: null,
      county: "Kisumu",
    });

    const response = await POST(req({ gameId: GAME_ID, targetChampionshipId: TARGET_CHAMP_ID, topN: 1 }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.promoted).toEqual([{ team: "Oruba Base - Kisangura", created: true, rosterCopied: 0 }]);
    expect(tournamentTeamCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Oruba Base - Kisangura",
          promotedFromTeamId: TEAM_ID,
          championshipId: TARGET_CHAMP_ID,
          gameId: TARGET_GAME_ID,
        }),
      }),
    );
  });

  it("keeps a Primary-level team's own name unchanged at the target level", async () => {
    gameFindUnique.mockResolvedValue(originGame("PRIMARY"));
    tournamentTeamFindUnique.mockResolvedValue({
      id: TEAM_ID,
      name: "Kisangura",
      gender: "BOYS",
      teamColor: null,
      contactName: null,
      contactEmail: null,
      contactPhone: null,
      county: "Kisumu",
    });

    const response = await POST(req({ gameId: GAME_ID, targetChampionshipId: TARGET_CHAMP_ID, topN: 1 }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.promoted).toEqual([{ team: "Kisangura", created: true, rosterCopied: 0 }]);
  });

  it("copies the roster with fresh, non-colliding bib numbers", async () => {
    gameFindUnique.mockResolvedValue(originGame("JS"));
    tournamentTeamFindUnique.mockResolvedValue({
      id: TEAM_ID,
      name: "Kisangura",
      gender: "BOYS",
      teamColor: null,
      contactName: null,
      contactEmail: null,
      contactPhone: null,
      county: "Kisumu",
    });
    participantFindMany.mockResolvedValue([
      { firstName: "John", lastName: "Doe", gender: "BOYS", jerseyNumber: 7, playingPosition: "Striker" },
      { firstName: "Jane", lastName: "Roe", gender: "BOYS", jerseyNumber: 4, playingPosition: "Defender" },
    ]);
    participantFindFirst.mockResolvedValue({ bibNumber: 50 }); // highest existing bib in target championship

    const response = await POST(req({ gameId: GAME_ID, targetChampionshipId: TARGET_CHAMP_ID, topN: 1 }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.promoted[0].rosterCopied).toBe(2);
    expect(participantCreate).toHaveBeenCalledTimes(2);
    expect(participantCreate).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: expect.objectContaining({ bibNumber: 51, jerseyNumber: 7 }) }));
    expect(participantCreate).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: expect.objectContaining({ bibNumber: 52, jerseyNumber: 4 }) }));
  });

  it("skips a team that was already promoted to this target championship", async () => {
    gameFindUnique.mockResolvedValue(originGame("JS"));
    tournamentTeamFindUnique.mockResolvedValue({ id: TEAM_ID, name: "Kisangura", county: "Kisumu" });
    tournamentTeamFindFirst.mockResolvedValue({ id: "existing-promoted", name: "Oruba Base - Kisangura" });

    const response = await POST(req({ gameId: GAME_ID, targetChampionshipId: TARGET_CHAMP_ID, topN: 1 }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.promoted).toEqual([{ team: "Oruba Base - Kisangura", created: false, rosterCopied: 0 }]);
    expect(tournamentTeamCreate).not.toHaveBeenCalled();
  });

  it("rejects a team from a different county than a geographically-restricted target", async () => {
    gameFindUnique.mockResolvedValue(originGame("JS"));
    tournamentTeamFindUnique.mockResolvedValue({ id: TEAM_ID, name: "Kisangura", county: "Nairobi" });
    championshipFindUnique.mockResolvedValue({ id: TARGET_CHAMP_ID, level: "ZONE", county: "Kisumu" });

    const response = await POST(req({ gameId: GAME_ID, targetChampionshipId: TARGET_CHAMP_ID, topN: 1 }));

    expect(response.status).toBe(403);
    expect(tournamentTeamCreate).not.toHaveBeenCalled();
  });

  it("rejects when no matching game exists yet in the target championship", async () => {
    gameFindUnique.mockResolvedValue(originGame("JS"));
    gameFindFirst.mockResolvedValue(null);

    const response = await POST(req({ gameId: GAME_ID, targetChampionshipId: TARGET_CHAMP_ID, topN: 1 }));

    expect(response.status).toBe(400);
    expect(tournamentTeamCreate).not.toHaveBeenCalled();
  });

  it("rejects a timed (non-team) event", async () => {
    gameFindUnique.mockResolvedValue({ ...originGame("JS"), isTimed: true, sport: null });

    const response = await POST(req({ gameId: GAME_ID, targetChampionshipId: TARGET_CHAMP_ID, topN: 1 }));

    expect(response.status).toBe(400);
  });

  it("returns 404 when the origin game doesn't exist", async () => {
    gameFindUnique.mockResolvedValue(null);

    const response = await POST(req({ gameId: GAME_ID, targetChampionshipId: TARGET_CHAMP_ID, topN: 1 }));

    expect(response.status).toBe(404);
  });

  it("returns 404 when the target championship doesn't exist", async () => {
    gameFindUnique.mockResolvedValue(originGame("JS"));
    championshipFindUnique.mockResolvedValue(null);

    const response = await POST(req({ gameId: GAME_ID, targetChampionshipId: TARGET_CHAMP_ID, topN: 1 }));

    expect(response.status).toBe(404);
  });
});
