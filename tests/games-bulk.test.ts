import { describe, it, expect, vi, beforeEach } from "vitest";

const requireChampionshipAccessMock = vi.fn();
const gameFindMany = vi.fn();
const txGameUpdateMany = vi.fn();
const txGameDeleteMany = vi.fn();
const auditLogCreate = vi.fn();

vi.mock("@/lib/authorize", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authorize")>("@/lib/authorize");
  return { ...actual, requireChampionshipAccess: (...args: unknown[]) => requireChampionshipAccessMock(...args) };
});
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

const txClient = {
  game: { updateMany: txGameUpdateMany, deleteMany: txGameDeleteMany },
  auditLog: { create: auditLogCreate },
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    game: { findMany: (...args: unknown[]) => gameFindMany(...args) },
    $transaction: (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient),
  },
}));

const { POST } = await import("@/app/api/games/bulk/route");
const { AuthorizationError } = await import("@/lib/authorize");

const CHAMP = "11111111-1111-1111-1111-111111111111";
const G1 = "22222222-2222-2222-2222-222222222222";
const G2 = "33333333-3333-3333-3333-333333333333";

function req(body: unknown): Request {
  return new Request("http://localhost/api/games/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/games/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChampionshipAccessMock.mockResolvedValue({ userId: "admin-1" });
    gameFindMany.mockResolvedValue([{ id: G1 }, { id: G2 }]);
    txGameUpdateMany.mockResolvedValue({ count: 2 });
    txGameDeleteMany.mockResolvedValue({ count: 2 });
  });

  it("requires tournament-admin access to the championship", async () => {
    requireChampionshipAccessMock.mockRejectedValue(new AuthorizationError("You do not have access to this championship"));
    const res = await POST(req({ championshipId: CHAMP, gameIds: [G1], action: "deactivate" }));
    expect(res.status).toBe(403);
    expect(requireChampionshipAccessMock).toHaveBeenCalledWith(CHAMP, ["TOURNAMENT_ADMIN"]);
    expect(txGameUpdateMany).not.toHaveBeenCalled();
  });

  it("deactivates the selected games", async () => {
    const res = await POST(req({ championshipId: CHAMP, gameIds: [G1, G2], action: "deactivate" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ affected: 2 });
    expect(txGameUpdateMany).toHaveBeenCalledWith({ where: { id: { in: [G1, G2] } }, data: { isActive: false } });
  });

  it("re-activates the selected games", async () => {
    await POST(req({ championshipId: CHAMP, gameIds: [G1, G2], action: "activate" }));
    expect(txGameUpdateMany).toHaveBeenCalledWith({ where: { id: { in: [G1, G2] } }, data: { isActive: true } });
  });

  it("deletes the selected games", async () => {
    await POST(req({ championshipId: CHAMP, gameIds: [G1, G2], action: "delete" }));
    expect(txGameDeleteMany).toHaveBeenCalledWith({ where: { id: { in: [G1, G2] } } });
  });

  it("refuses when any game belongs to a different championship", async () => {
    gameFindMany.mockResolvedValue([{ id: G1 }]); // G2 isn't in this championship
    const res = await POST(req({ championshipId: CHAMP, gameIds: [G1, G2], action: "delete" }));
    expect(res.status).toBe(404);
    expect(gameFindMany).toHaveBeenCalledWith({ where: { id: { in: [G1, G2] }, championshipId: CHAMP } });
    expect(txGameDeleteMany).not.toHaveBeenCalled();
  });
});
