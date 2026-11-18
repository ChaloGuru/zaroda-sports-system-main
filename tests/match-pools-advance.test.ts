import { describe, it, expect, vi, beforeEach } from "vitest";

const gameFindUnique = vi.fn();
const poolFindMany = vi.fn();
const matchPoolFindMany = vi.fn();
const matchPoolCreateMany = vi.fn();
const requireGameAccessMock = vi.fn();

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
    requireGameAccess: (...args: unknown[]) => requireGameAccessMock(...args),
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
    requireGameAccessMock.mockResolvedValue({ userId: "user-1", email: "a@b.com", tenantId: "t1", roles: [] });
    matchPoolCreateMany.mockResolvedValue({ count: 1 });
  });

  const POOL_RESULTS = [
    // Pool A: A1 beat A2 3-0. Pool B: B1 beat B2 2-1.
    { poolId: POOL_A, teamAId: TEAM_A1, teamBId: TEAM_A2, teamAScore: 3, teamBScore: 0, isWalkover: false, winnerId: TEAM_A1 },
    { poolId: POOL_B, teamAId: TEAM_B1, teamBId: TEAM_B2, teamAScore: 2, teamBScore: 1, isWalkover: false, winnerId: TEAM_B1 },
  ];
  const TWO_POOLS = [
    { id: POOL_A, teams: [{ id: TEAM_A1 }, { id: TEAM_A2 }] },
    { id: POOL_B, teams: [{ id: TEAM_B1 }, { id: TEAM_B2 }] },
  ];
  const GAME = { id: GAME_ID, championshipId: "champ-1", sport: "FOOTBALL", championship: SINGLE_DAY_CHAMPIONSHIP };

  it("one team per pool from two pools goes straight to the final", async () => {
    gameFindUnique.mockResolvedValue(GAME);
    poolFindMany.mockResolvedValue(TWO_POOLS);
    matchPoolFindMany.mockResolvedValueOnce(POOL_RESULTS);

    const response = await POST(req({ gameId: GAME_ID, topPerPool: 1 }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ advanced: 2, roundName: "Final", byes: 0 });
    expect(matchPoolCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ gameId: GAME_ID, poolId: null, roundName: "Final", teamAId: TEAM_A1, teamBId: TEAM_B1, isBye: false })],
    });
  });

  it("top two from two pools: semifinals cross the pools (A1 v B2, B1 v A2) in bracket order", async () => {
    gameFindUnique.mockResolvedValue(GAME);
    poolFindMany.mockResolvedValue(TWO_POOLS);
    matchPoolFindMany.mockResolvedValueOnce(POOL_RESULTS);
    matchPoolCreateMany.mockResolvedValue({ count: 2 });

    const response = await POST(req({ gameId: GAME_ID, topPerPool: 2 }));
    const rows = matchPoolCreateMany.mock.calls[0]?.[0].data as Array<{ teamAId: string; teamBId: string; roundName: string; createdAt: Date }>;

    expect(response.status).toBe(200);
    expect(rows.map((r) => [r.teamAId, r.teamBId])).toEqual([[TEAM_A1, TEAM_B2], [TEAM_B1, TEAM_A2]]);
    expect(rows.every((r) => r.roundName === "Semifinal")).toBe(true);
    expect(rows[0]!.createdAt.getTime()).toBeLessThan(rows[1]!.createdAt.getTime());
  });

  it("three qualifiers: the top seed gets a bye", async () => {
    gameFindUnique.mockResolvedValue(GAME);
    poolFindMany.mockResolvedValue([...TWO_POOLS, { id: "pool-c", teams: [{ id: "c1" }] }]);
    matchPoolFindMany.mockResolvedValueOnce(POOL_RESULTS);
    matchPoolCreateMany.mockResolvedValue({ count: 2 });

    const response = await POST(req({ gameId: GAME_ID, topPerPool: 1 }));
    const json = await response.json();
    const rows = matchPoolCreateMany.mock.calls[0]?.[0].data as Array<{ teamAId: string; teamBId: string; isBye: boolean; winnerId: string | null }>;

    expect(json).toMatchObject({ advanced: 3, roundName: "Semifinal", byes: 1 });
    expect(rows[0]).toMatchObject({ teamAId: TEAM_A1, teamBId: TEAM_A1, isBye: true, winnerId: TEAM_A1 });
    expect(rows[1]).toMatchObject({ teamAId: TEAM_B1, teamBId: "c1", isBye: false, winnerId: null });
  });

  it("refuses while a pool match has no result", async () => {
    gameFindUnique.mockResolvedValue(GAME);
    poolFindMany.mockResolvedValue(TWO_POOLS);
    matchPoolFindMany.mockResolvedValueOnce([POOL_RESULTS[0], { ...POOL_RESULTS[1], teamAScore: null, teamBScore: null, winnerId: null }]);

    const response = await POST(req({ gameId: GAME_ID, topPerPool: 1 }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/1 pool match still has no result/);
    expect(matchPoolCreateMany).not.toHaveBeenCalled();
  });

  it("refuses to draw again once the knockout exists", async () => {
    gameFindUnique.mockResolvedValue(GAME);
    poolFindMany.mockResolvedValue(TWO_POOLS);
    matchPoolFindMany.mockResolvedValueOnce([...POOL_RESULTS, { poolId: null, teamAId: TEAM_A1, teamBId: TEAM_B1, teamAScore: null, teamBScore: null, isWalkover: false, winnerId: null }]);

    const response = await POST(req({ gameId: GAME_ID, topPerPool: 1 }));

    expect(response.status).toBe(409);
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
