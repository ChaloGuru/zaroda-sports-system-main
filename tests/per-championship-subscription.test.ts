import { describe, it, expect, vi, beforeEach } from "vitest";

const subscriptionFindFirst = vi.fn();
const championshipCreate = vi.fn();
const subscriptionUpdateMany = vi.fn();

vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue({
    user: { id: "owner-1", tenantId: "tenant-1", roles: [{ role: "TENANT_OWNER", championshipId: null }] },
  }),
}));
vi.mock("@/lib/default-games", () => ({ defaultGamesFor: () => [] }));
const tx = {
  championship: { create: (...a: unknown[]) => championshipCreate(...a) },
  championshipSubscription: { updateMany: (...a: unknown[]) => subscriptionUpdateMany(...a) },
  auditLog: { create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    championshipSubscription: { findFirst: (...a: unknown[]) => subscriptionFindFirst(...a) },
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

const { POST } = await import("@/app/api/championships/route");

function create(level: string) {
  return POST(
    new Request("http://localhost/api/championships", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Kisumu Primary Games",
        level,
        schoolLevel: "PRIMARY_JS",
        category: "ATHLETICS",
        county: "Kisumu",
        location: "Kisumu",
        startDate: "2026-11-01",
        endDate: "2026-11-02",
      }),
    }),
  );
}

describe("one subscription per championship", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    championshipCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: "champ-new", ...data }));
    subscriptionUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("uses up an unused subscription for the level when the championship is created", async () => {
    subscriptionFindFirst.mockResolvedValue({ id: "sub-1" });
    const res = await create("ZONE");
    expect(res.status).toBe(201);
    expect(subscriptionFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ championshipId: null, plan: { level: "ZONE" } }) }));
    expect(subscriptionUpdateMany).toHaveBeenCalledWith({ where: { id: "sub-1", championshipId: null }, data: { championshipId: "champ-new" } });
  });

  it("refuses a second championship once the subscription has been used", async () => {
    subscriptionFindFirst.mockResolvedValue(null);
    const res = await create("ZONE");
    expect(res.status).toBe(402);
    expect((await res.json()).error).toMatch(/Pay for a Zone championship first/);
    expect(championshipCreate).not.toHaveBeenCalled();
  });

  it("refuses when another championship claims the same subscription at the same moment", async () => {
    subscriptionFindFirst.mockResolvedValue({ id: "sub-1" });
    subscriptionUpdateMany.mockResolvedValue({ count: 0 });
    const res = await create("ZONE");
    expect(res.status).toBe(409);
  });

  it("needs no subscription at Inter School level", async () => {
    const res = await create("BASE");
    expect(res.status).toBe(201);
    expect(subscriptionFindFirst).not.toHaveBeenCalled();
    expect(subscriptionUpdateMany).not.toHaveBeenCalled();
  });
});
