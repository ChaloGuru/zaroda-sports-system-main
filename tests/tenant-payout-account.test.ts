import { describe, it, expect, vi, beforeEach } from "vitest";

const createPaystackSubaccountMock = vi.fn();
const requireAuthMock = vi.fn();
const tenantFindUnique = vi.fn();
const tenantUpdate = vi.fn();

vi.mock("@/lib/paystack", () => ({
  createPaystackSubaccount: (...args: unknown[]) => createPaystackSubaccountMock(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: (...args: unknown[]) => tenantFindUnique(...args),
      update: (...args: unknown[]) => tenantUpdate(...args),
    },
  },
}));

vi.mock("@/lib/authorize", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authorize")>("@/lib/authorize");
  return {
    ...actual,
    requireAuth: (...args: unknown[]) => requireAuthMock(...args),
  };
});

const { POST } = await import("@/app/api/tenant/payout-account/route");

function req(body: unknown): Request {
  return new Request("http://localhost/api/tenant/payout-account", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const TENANT_OWNER_CTX = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  roles: [{ role: "TENANT_OWNER", championshipId: null }],
};

describe("POST /api/tenant/payout-account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue(TENANT_OWNER_CTX);
    tenantFindUnique.mockResolvedValue({ id: "tenant-1", organizationName: "Jane's Open Tournament" });
    tenantUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      subaccountStatus: data.subaccountStatus ?? "PENDING",
      settlementBankName: data.settlementBankName ?? "Equity Bank",
      settlementBankCode: data.settlementBankCode ?? "068",
      settlementAccountNumber: data.settlementAccountNumber ?? "1234567890",
      settlementAccountName: data.settlementAccountName ?? null,
    }));
  });

  it("creates a subaccount with percentage_charge:0 and marks the tenant ACTIVE on success", async () => {
    createPaystackSubaccountMock.mockResolvedValue({
      status: true,
      message: "ok",
      data: {
        subaccount_code: "ACCT_123",
        account_number: "1234567890",
        account_name: "Jane's Open Tournament",
        settlement_bank: "068",
        percentage_charge: 0,
      },
    });

    const res = await POST(
      req({ settlementBankCode: "068", settlementBankName: "Equity Bank", accountNumber: "1234567890" }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(createPaystackSubaccountMock).toHaveBeenCalledWith({
      businessName: "Jane's Open Tournament",
      settlementBankCode: "068",
      accountNumber: "1234567890",
    });
    expect(json.payoutAccount.subaccountStatus).toBe("ACTIVE");
    expect(json.payoutAccount.settlementAccountName).toBe("Jane's Open Tournament");
    // Confirm the final update call is the one that flips status to ACTIVE.
    expect(tenantUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subaccountStatus: "ACTIVE", paystackSubaccountCode: "ACCT_123" }),
      }),
    );
  });

  it("sets the tenant to FAILED and surfaces the error when Paystack rejects the account", async () => {
    createPaystackSubaccountMock.mockRejectedValue(new Error("Invalid account number"));

    const res = await POST(req({ settlementBankCode: "068", settlementBankName: "Equity Bank", accountNumber: "bad" }));
    const json = await res.json();

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(json.error).toMatch(/Invalid account number/);
    expect(tenantUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { subaccountStatus: "FAILED" } }),
    );
  });

  it("rejects a non-tenant-owner caller", async () => {
    requireAuthMock.mockResolvedValue({ userId: "u2", email: "x@x.com", tenantId: null, roles: [] });

    const res = await POST(req({ settlementBankCode: "068", settlementBankName: "Equity Bank", accountNumber: "1234567890" }));

    expect(res.status).toBe(403);
    expect(createPaystackSubaccountMock).not.toHaveBeenCalled();
  });

  it("lets a super admin (who has no tenant of their own) configure a named tenant's payout account", async () => {
    requireAuthMock.mockResolvedValue({
      userId: "admin-1",
      email: "admin@zaroda.com",
      tenantId: null,
      roles: [{ role: "SUPER_ADMIN", championshipId: null }],
    });
    createPaystackSubaccountMock.mockResolvedValue({
      status: true,
      message: "ok",
      data: {
        subaccount_code: "ACCT_999",
        account_number: "1234567890",
        account_name: "Jane's Open Tournament",
        settlement_bank: "068",
        percentage_charge: 0,
      },
    });

    const res = await POST(
      req({
        settlementBankCode: "068",
        settlementBankName: "Equity Bank",
        accountNumber: "1234567890",
        tenantId: "11111111-1111-1111-1111-111111111111",
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(tenantFindUnique).toHaveBeenCalledWith({ where: { id: "11111111-1111-1111-1111-111111111111" } });
    expect(json.payoutAccount.subaccountStatus).toBe("ACTIVE");
  });

  it("rejects a super admin who didn't name a tenant", async () => {
    requireAuthMock.mockResolvedValue({
      userId: "admin-1",
      email: "admin@zaroda.com",
      tenantId: null,
      roles: [{ role: "SUPER_ADMIN", championshipId: null }],
    });

    const res = await POST(req({ settlementBankCode: "068", settlementBankName: "Equity Bank", accountNumber: "1234567890" }));

    expect(res.status).toBe(403);
    expect(createPaystackSubaccountMock).not.toHaveBeenCalled();
  });
});
