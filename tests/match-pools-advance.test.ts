import { describe, it, expect, vi, beforeEach } from "vitest";

const gameFindUnique = vi.fn();
const poolFindMany = vi.fn();
const matchPoolFindMany = vi.fn();
const matchPoolCreateMany = vi.fn();
const requireChampionshipAccessMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    game: { findUnique: (...args: unknown[]) => gameFindUnique(...args) },
    pool: { findMany: (...args: unknown[]) => poolFindMany(...args) },
    matchPool: {
      findMany: (...args: unknown[]) => matchPoolFindMany(...args),
      createMany: (...args: unknown[]) => matchPoolCreateMany(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ matchPool: { createMany: (...args: unknown[]) => matchPoolCreateMany(...args) }, auditLog: { create: vi.fn() } }),
  },
}));

vi.mock("@/lib/authorize", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authorize")>("@/lib/authorize");
  return {
    ...actual,
    requireChampionshipAccess: (...args: unknown[]) => requireChampionshipAccessMock(...args),
  };
});

const { POST } = await import("@/app/api/match-pools/advance/route");

function req(body: unknown): Request {
  return new Request("http://localhost/api/match-pools/advance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Single-day championship by default, so distributeMatchDatesFromEnd yields
// null and existing assertions don't need to account for a matchDate.
const SINGLE_DAY_CHAMPIONSHIP = { startDate: new Date("2026-07-10"), endDate: new Date("2026-07-10") };

const GAME_ID = "11111111-1111-1111-1111-111111111111";
const POOL_A = "22222222-2222-2222-2222-222222222222";
const POOL_B = "33333333-3333-3333-3333-333333333333";
const TEAM_A1 = "aaaaaaaa-0000-0000-0000-000000000001";
const TEAM_A2 = "aaaaaaaa-0000-0000-0000-000000000002";
const TEAM_B1 = "bbbbbbbb-0000-0000-0000-000000000001";
const TEAM_B2 = "bbbbbbbb-0000-0000-0000-000000000002";

describe("POST /api/match-pools/advance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChampionshipAccessMock.mockResolvedValue({ userId: "user-1", email: "a@b.com", tenantId: "t1", roles: [] });
    matchPoolCreateMany.mockResolvedValue({ count: 1 });
  });

  it("advances the top team from each pool and schedules a knockout fixture between them", async () => {
    gameFindUnique.mockResolvedValue({
      id: GAME_ID,
      championshipId: "champ-1",
      sport: "FOOTBALL",
      championship: SINGLE_DAY_CHAMPIONSHIP,
    });
    poolFindMany.mockResolvedValue([
      { id: POOL_A, teams: [{ id: TEAM_A1 }, { id: TEAM_A2 }] },
      { id: POOL_B, teams: [{ id: TEAM_B1 }, { id: TEAM_B2 }] },
    ]);
    // Pool A: team A1 beat A2 3-0. Pool B: team B1 beat B2 2-1.
    matchPoolFindMany
      .mockResolvedValueOnce([
        { poolId: POOL_A, teamAId: TEAM_A1, teamBId: TEAM_A2, teamAScore: 3, teamBScore: 0 },
        { poolId: POOL_B, teamAId: TEAM_B1, teamBId: TEAM_B2, teamAScore: 2, teamBScore: 1 },
      ])
      .mockResolvedValueOnce([]); // no existing knockout fixtures yet

    const response = await POST(req({ gameId: GAME_ID, topPerPool: 1 }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.advanced).toBe(2);
    expect(json.created).toBe(1);
    expect(matchPoolCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          gameId: GAME_ID,
          poolId: null,
          roundName: "Knockout Stage - Round 1",
          teamAId: TEAM_A1,
          teamBId: TEAM_B1,
        }),
      ],
    });
  });

  it("does not re-create a knockout fixture that already exists between the advancing teams", async () => {
    gameFindUnique.mockResolvedValue({
      id: GAME_ID,
      championshipId: "champ-1",
      sport: "FOOTBALL",
      championship: SINGLE_DAY_CHAMPIONSHIP,
    });
    poolFindMany.mockResolvedValue([
      { id: POOL_A, teams: [{ id: TEAM_A1 }] },
      { id: POOL_B, teams: [{ id: TEAM_B1 }] },
    ]);
    matchPoolFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ teamAId: TEAM_A1, teamBId: TEAM_B1 }]); // already scheduled

    const response = await POST(req({ gameId: GAME_ID, topPerPool: 1 }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.created).toBe(0);
    expect(matchPoolCreateMany).not.toHaveBeenCalled();
  });

  it("rejects when the game has no pools", async () => {
    gameFindUnique.mockResolvedValue({
      id: GAME_ID,
      championshipId: "champ-1",
      sport: "FOOTBALL",
      championship: SINGLE_DAY_CHAMPIONSHIP,
    });
    poolFindMany.mockResolvedValue([]);

    const response = await POST(req({ gameId: GAME_ID, topPerPool: 1 }));

    expect(response.status).toBe(400);
    expect(matchPoolCreateMany).not.toHaveBeenCalled();
  });

  it("rejects when the game has no sport set", async () => {
    gameFindUnique.mockResolvedValue({ id: GAME_ID, championshipId: "champ-1", sport: null });

    const response = await POST(req({ gameId: GAME_ID, topPerPool: 1 }));

    expect(response.status).toBe(400);
    expect(poolFindMany).not.toHaveBeenCalled();
  });

  it("rejects when fewer than two teams would advance", async () => {
    gameFindUnique.mockResolvedValue({
      id: GAME_ID,
      championshipId: "champ-1",
      sport: "FOOTBALL",
      championship: SINGLE_DAY_CHAMPIONSHIP,
    });
    poolFindMany.mockResolvedValue([{ id: POOL_A, teams: [{ id: TEAM_A1 }] }]);
    matchPoolFindMany.mockResolvedValueOnce([]);

    const response = await POST(req({ gameId: GAME_ID, topPerPool: 1 }));

    expect(response.status).toBe(400);
    expect(matchPoolCreateMany).not.toHaveBeenCalled();
  });

  it("returns 404 when the game doesn't exist", async () => {
    gameFindUnique.mockResolvedValue(null);

    const response = await POST(req({ gameId: GAME_ID, topPerPool: 1 }));

    expect(response.status).toBe(404);
  });
});
