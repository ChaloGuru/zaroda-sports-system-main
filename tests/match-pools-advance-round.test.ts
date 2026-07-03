import { describe, it, expect, vi, beforeEach } from "vitest";

const gameFindUnique = vi.fn();
const matchPoolFindMany = vi.fn();
const matchPoolCreateMany = vi.fn();
const requireChampionshipAccessMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    game: { findUnique: (...args: unknown[]) => gameFindUnique(...args) },
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

const { POST } = await import("@/app/api/match-pools/advance-round/route");

function req(body: unknown): Request {
  return new Request("http://localhost/api/match-pools/advance-round", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const GAME_ID = "11111111-1111-1111-1111-111111111111";
const T1 = "aaaaaaaa-0000-0000-0000-000000000001";
const T2 = "aaaaaaaa-0000-0000-0000-000000000002";
const T3 = "aaaaaaaa-0000-0000-0000-000000000003";
const T4 = "aaaaaaaa-0000-0000-0000-000000000004";

function fixture(id: string, teamAId: string, teamBId: string, winnerId: string | null, roundName = "Round 1") {
  return { id, gameId: GAME_ID, poolId: null, roundName, teamAId, teamBId, teamAScore: 1, teamBScore: 0, winnerId };
}

describe("POST /api/match-pools/advance-round", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChampionshipAccessMock.mockResolvedValue({ userId: "user-1", email: "a@b.com", tenantId: "t1", roles: [] });
    matchPoolCreateMany.mockImplementation((args: { data: unknown[] }) => Promise.resolve({ count: args.data.length }));
    gameFindUnique.mockResolvedValue({ id: GAME_ID, championshipId: "champ-1" });
  });

  it("pairs Round 1 winners into a Semifinal when four winners remain", async () => {
    matchPoolFindMany
      .mockResolvedValueOnce([
        fixture("f1", T1, T2, T1),
        fixture("f2", T3, T4, T4),
      ])
      .mockResolvedValueOnce([]); // no existing pairs

    const response = await POST(req({ gameId: GAME_ID, roundName: "Round 1" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.created).toBe(1);
    expect(json.roundName).toBe("Final");
    expect(matchPoolCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ gameId: GAME_ID, poolId: null, roundName: "Final", teamAId: T1, teamBId: T4 })],
    });
  });

  it("names the next round Semifinal when pairing produces two matches", async () => {
    matchPoolFindMany
      .mockResolvedValueOnce([
        fixture("f1", T1, T2, T1, "Quarterfinal"),
        fixture("f2", T3, T4, T4, "Quarterfinal"),
        fixture("f3", "t5", "t6", "t5", "Quarterfinal"),
        fixture("f4", "t7", "t8", "t8", "Quarterfinal"),
      ])
      .mockResolvedValueOnce([]);

    const response = await POST(req({ gameId: GAME_ID, roundName: "Quarterfinal" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.roundName).toBe("Semifinal");
    expect(json.created).toBe(2);
  });

  it("rejects when a match in the round is still undecided", async () => {
    matchPoolFindMany.mockResolvedValueOnce([fixture("f1", T1, T2, T1), fixture("f2", T3, T4, null)]);

    const response = await POST(req({ gameId: GAME_ID, roundName: "Round 1" }));

    expect(response.status).toBe(400);
    expect(matchPoolCreateMany).not.toHaveBeenCalled();
  });

  it("rejects an odd number of winners since they can't be auto-paired", async () => {
    matchPoolFindMany.mockResolvedValueOnce([
      fixture("f1", T1, T2, T1),
      fixture("f2", T3, T4, T4),
      fixture("f3", "t5", "t6", "t5"),
    ]);

    const response = await POST(req({ gameId: GAME_ID, roundName: "Round 1" }));

    expect(response.status).toBe(400);
    expect(matchPoolCreateMany).not.toHaveBeenCalled();
  });

  it("rejects when the round only has one match (already a final)", async () => {
    matchPoolFindMany.mockResolvedValueOnce([fixture("f1", T1, T2, T1, "Final")]);

    const response = await POST(req({ gameId: GAME_ID, roundName: "Final" }));

    expect(response.status).toBe(400);
    expect(matchPoolCreateMany).not.toHaveBeenCalled();
  });

  it("does not recreate a pairing that already exists", async () => {
    matchPoolFindMany
      .mockResolvedValueOnce([fixture("f1", T1, T2, T1), fixture("f2", T3, T4, T4)])
      .mockResolvedValueOnce([{ teamAId: T1, teamBId: T4 }]); // already scheduled

    const response = await POST(req({ gameId: GAME_ID, roundName: "Round 1" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.created).toBe(0);
    expect(matchPoolCreateMany).not.toHaveBeenCalled();
  });

  it("returns 404 when the round has no fixtures", async () => {
    matchPoolFindMany.mockResolvedValueOnce([]);

    const response = await POST(req({ gameId: GAME_ID, roundName: "Round 5" }));

    expect(response.status).toBe(404);
  });

  it("returns 404 when the game doesn't exist", async () => {
    gameFindUnique.mockResolvedValue(null);

    const response = await POST(req({ gameId: GAME_ID, roundName: "Round 1" }));

    expect(response.status).toBe(404);
  });
});
