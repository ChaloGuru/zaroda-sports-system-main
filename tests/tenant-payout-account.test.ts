import { describe, it, expect, vi, beforeEach } from "vitest";

const checkCredentials = vi.fn();
const requireAuthMock = vi.fn();
const tenantFindUnique = vi.fn();
const tenantUpdate = vi.fn();

process.env.NEXTAUTH_SECRET = "test-secret";

vi.mock("@/lib/tuma", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tuma")>("@/lib/tuma");
  return { ...actual, checkTumaCredentials: (...a: unknown[]) => checkCredentials(...a) };
});
vi.mock("@/lib/prisma", () => ({
  prisma: { tenant: { findUnique: (...a: unknown[]) => tenantFindUnique(...a), update: (...a: unknown[]) => tenantUpdate(...a) } },
}));
vi.mock("@/lib/authorize", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authorize")>("@/lib/authorize");
  return { ...actual, requireAuth: (...a: unknown[]) => requireAuthMock(...a) };
});

const { POST, GET, DELETE } = await import("@/app/api/tenant/payout-account/route");
const { decryptSecret } = await import("@/lib/secret-box");

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/tenant/payout-account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

const OWNER = { userId: "user-1", email: "owner@example.com", tenantId: "tenant-1", roles: [{ role: "TENANT_OWNER", championshipId: null }] };
const SUPER = { userId: "admin-1", email: "admin@example.com", tenantId: null, roles: [{ role: "SUPER_ADMIN", championshipId: null }] };
const BODY = { tumaEmail: "Jane@Example.com", tumaApiKey: "tuma-secret-key" };

describe("/api/tenant/payout-account (TUMA)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue(OWNER);
    tenantFindUnique.mockResolvedValue({ id: "tenant-1" });
    tenantUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ subaccountStatus: data.subaccountStatus, tumaEmail: data.tumaEmail }));
    checkCredentials.mockResolvedValue(undefined);
  });

  it("checks the details with TUMA, stores the key encrypted and marks the account connected", async () => {
    const res = await post(BODY);
    expect(res.status).toBe(201);
    expect(checkCredentials).toHaveBeenCalledWith({ email: "jane@example.com", apiKey: "tuma-secret-key" });
    const data = tenantUpdate.mock.calls[0]![0].data;
    expect(data).toMatchObject({ tumaEmail: "jane@example.com", subaccountStatus: "ACTIVE" });
    expect(data.tumaApiKeyEncrypted).not.toContain("tuma-secret-key");
    expect(decryptSecret(data.tumaApiKeyEncrypted)).toBe("tuma-secret-key");
    expect(JSON.stringify(await res.json())).not.toContain("tuma-secret-key");
  });

  it("saves nothing when TUMA rejects the details", async () => {
    checkCredentials.mockRejectedValue(new Error("Invalid credentials"));
    const res = await post(BODY);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid credentials/);
    expect(tenantUpdate).not.toHaveBeenCalled();
  });

  it("rejects a non-tenant-owner caller", async () => {
    requireAuthMock.mockResolvedValue({ ...OWNER, roles: [{ role: "TEAM_MANAGER", championshipId: "c" }] });
    const res = await post(BODY);
    expect(res.status).toBe(403);
    expect(tenantUpdate).not.toHaveBeenCalled();
  });

  it("lets a super admin connect a named tenant's account", async () => {
    requireAuthMock.mockResolvedValue(SUPER);
    tenantFindUnique.mockResolvedValue({ id: "33333333-3333-3333-3333-333333333333" });
    const res = await post({ ...BODY, tenantId: "33333333-3333-3333-3333-333333333333" });
    expect(res.status).toBe(201);
    expect(tenantUpdate.mock.calls[0]![0].where).toEqual({ id: "33333333-3333-3333-3333-333333333333" });
  });

  it("rejects a super admin who didn't name a tenant", async () => {
    requireAuthMock.mockResolvedValue(SUPER);
    const res = await post(BODY);
    expect(res.status).toBe(403);
  });

  it("never returns the key when read", async () => {
    tenantFindUnique.mockResolvedValue({ subaccountStatus: "ACTIVE", tumaEmail: "jane@example.com" });
    const res = await GET(new Request("http://localhost/api/tenant/payout-account"));
    expect(tenantFindUnique.mock.calls[0]![0].select).toEqual({ subaccountStatus: true, tumaEmail: true });
    expect((await res.json()).payoutAccount).toEqual({ subaccountStatus: "ACTIVE", tumaEmail: "jane@example.com" });
  });

  it("disconnects, clearing the stored key", async () => {
    await DELETE(new Request("http://localhost/api/tenant/payout-account", { method: "DELETE" }));
    expect(tenantUpdate.mock.calls[0]![0].data).toEqual({ tumaEmail: null, tumaApiKeyEncrypted: null, subaccountStatus: "NOT_CONFIGURED" });
  });
});
