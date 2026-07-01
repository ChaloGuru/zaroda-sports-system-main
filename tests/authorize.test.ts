import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirstMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    championshipSubscription: {
      findFirst: (...args: unknown[]) => findFirstMock(...args),
    },
  },
}));

// Imported after the mock so authorize.ts picks up the mocked prisma client.
const { requireActiveSubscriptionForLevel, AuthorizationError } = await import("@/lib/authorize");

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
