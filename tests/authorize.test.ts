import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirstMock = vi.fn();
const championshipFindUniqueMock = vi.fn();
const getServerSessionMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    championshipSubscription: {
      findFirst: (...args: unknown[]) => findFirstMock(...args),
    },
    championship: {
      findUnique: (...args: unknown[]) => championshipFindUniqueMock(...args),
    },
  },
}));

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSessionMock(...args),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

// Imported after the mocks so authorize.ts picks up the mocked prisma client / session.
const { requireActiveSubscriptionForLevel, requireChampionshipAccess, AuthorizationError } = await import(
  "@/lib/authorize"
);

function mockSession(roles: Array<{ role: string; championshipId: string | null }>) {
  getServerSessionMock.mockResolvedValue({
    user: { id: "user-1", email: "official@example.com", tenantId: null, roles },
  });
}

describe("requireChampionshipAccess (championship-scoped role expiry)", () => {
  beforeEach(() => {
    championshipFindUniqueMock.mockReset();
    getServerSessionMock.mockReset();
  });

  it("grants access while the championship is ongoing", async () => {
    mockSession([{ role: "SCOREKEEPER", championshipId: "champ-1" }]);
    championshipFindUniqueMock.mockResolvedValue({ endDate: new Date(Date.now() + 86_400_000) });

    await expect(requireChampionshipAccess("champ-1", ["SCOREKEEPER"])).resolves.toMatchObject({ userId: "user-1" });
  });

  it("grants access on the day the championship ends (grace period)", async () => {
    mockSession([{ role: "SCOREKEEPER", championshipId: "champ-1" }]);
    championshipFindUniqueMock.mockResolvedValue({ endDate: new Date() });

    await expect(requireChampionshipAccess("champ-1", ["SCOREKEEPER"])).resolves.toMatchObject({ userId: "user-1" });
  });

  it("denies access once the grace period after the championship's end date has passed", async () => {
    mockSession([{ role: "SCOREKEEPER", championshipId: "champ-1" }]);
    championshipFindUniqueMock.mockResolvedValue({ endDate: new Date(Date.now() - 3 * 86_400_000) });

    await expect(requireChampionshipAccess("champ-1", ["SCOREKEEPER"])).rejects.toThrow(/expired/);
  });
});

describe("requireActiveSubscriptionForLevel", () => {
  beforeEach(() => {
    findFirstMock.mockReset();
  });

  it("allows BASE level championships without ever querying for a subscription", async () => {
    await expect(requireActiveSubscriptionForLevel("tenant-1", "BASE")).resolves.toBeUndefined();
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("allows ZONE and above when an ACTIVE, unexpired subscription exists", async () => {
    findFirstMock.mockResolvedValue({ id: "sub-1", status: "ACTIVE", expiresAt: new Date(Date.now() + 86_400_000) });
    await expect(requireActiveSubscriptionForLevel("tenant-1", "ZONE")).resolves.toBeUndefined();
    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-1",
          status: "ACTIVE",
          plan: { level: "ZONE" },
        }),
      }),
    );
  });

  it("blocks ZONE and above when no matching subscription is found", async () => {
    findFirstMock.mockResolvedValue(null);
    await expect(requireActiveSubscriptionForLevel("tenant-1", "ZONE")).rejects.toThrow(AuthorizationError);
  });

  it("blocks when the only subscription found is for a different level (query itself filters by level)", async () => {
    // findFirst is called with plan.level in the where clause, so a subscription
    // for a different level simply never matches - simulate that as null.
    findFirstMock.mockResolvedValue(null);
    await expect(requireActiveSubscriptionForLevel("tenant-1", "NATIONAL")).rejects.toThrow(/Upgrade required/);
  });

  it("surfaces a 402 status on the thrown AuthorizationError", async () => {
    findFirstMock.mockResolvedValue(null);
    try {
      await requireActiveSubscriptionForLevel("tenant-1", "COUNTY");
      expect.unreachable("expected requireActiveSubscriptionForLevel to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
      expect((error as InstanceType<typeof AuthorizationError>).status).toBe(402);
    }
  });
});
