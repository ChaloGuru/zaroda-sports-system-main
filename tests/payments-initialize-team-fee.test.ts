import { describe, it, expect, vi, beforeEach } from "vitest";

const initializePaystackTransactionMock = vi.fn();
const championshipFeeFindUnique = vi.fn();
const tenantFindUnique = vi.fn();
const tournamentTeamFindUnique = vi.fn();
const tournamentTeamCreate = vi.fn();
const tournamentTeamFindFirst = vi.fn();
const teamFeePaymentCreate = vi.fn();

vi.mock("@/lib/paystack", () => ({
  initializePaystackTransaction: (...args: unknown[]) => initializePaystackTransactionMock(...args),
  kesToKobo: (amountKes: number) => Math.round(amountKes * 100),
  generatePaymentReference: (prefix: string) => `${prefix}_test`,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    championshipFee: { findUnique: (...args: unknown[]) => championshipFeeFindUnique(...args) },
    tenant: { findUnique: (...args: unknown[]) => tenantFindUnique(...args) },
    tournamentTeam: {
      findUnique: (...args: unknown[]) => tournamentTeamFindUnique(...args),
      create: (...args: unknown[]) => tournamentTeamCreate(...args),
      findFirst: (...args: unknown[]) => tournamentTeamFindFirst(...args),
    },
    teamFeePayment: { create: (...args: unknown[]) => teamFeePaymentCreate(...args) },
  },
}));

const { POST } = await import("@/app/api/payments/initialize/route");

function req(body: unknown): Request {
  return new Request("http://localhost/api/payments/initialize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const TEAM_FEE_BODY = {
  mode: "team_fee" as const,
  feeId: "11111111-1111-1111-1111-111111111111",
  teamId: "22222222-2222-2222-2222-222222222222",
  contactEmail: "manager@example.com",
};

describe("POST /api/payments/initialize (team_fee mode)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initializePaystackTransactionMock.mockResolvedValue({
      data: { authorization_url: "https://paystack.com/pay/abc", access_code: "abc", reference: "fee_test" },
    });
    tournamentTeamFindUnique.mockResolvedValue({ id: "team-1", name: "Team A", championshipId: "champ-1" });
    teamFeePaymentCreate.mockResolvedValue({ id: "payment-1" });
  });

  it("blocks payment when the open-tournament manager has not configured a payout account (NOT_CONFIGURED)", async () => {
    championshipFeeFindUnique.mockResolvedValue({
      id: "fee-1",
      championshipId: "champ-1",
      amountKes: 1000,
      championship: { level: "OPEN_TOURNAMENT", tenantId: "tenant-1", isPublished: true },
    });
    tenantFindUnique.mockResolvedValue({ subaccountStatus: "NOT_CONFIGURED", paystackSubaccountCode: null });

    const res = await POST(req(TEAM_FEE_BODY));
    const json = await res.json();

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(json.error).toMatch(/payout account/i);
    expect(initializePaystackTransactionMock).not.toHaveBeenCalled();
    expect(teamFeePaymentCreate).not.toHaveBeenCalled();
  });

  it("blocks payment when the payout account setup previously FAILED", async () => {
    championshipFeeFindUnique.mockResolvedValue({
      id: "fee-1",
      championshipId: "champ-1",
      amountKes: 1000,
      championship: { level: "OPEN_TOURNAMENT", tenantId: "tenant-1", isPublished: true },
    });
    tenantFindUnique.mockResolvedValue({ subaccountStatus: "FAILED", paystackSubaccountCode: null });

    const res = await POST(req(TEAM_FEE_BODY));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(initializePaystackTransactionMock).not.toHaveBeenCalled();
  });

  it("routes payment to the tenant's subaccount with 100% settlement when ACTIVE", async () => {
    championshipFeeFindUnique.mockResolvedValue({
      id: "fee-1",
      championshipId: "champ-1",
      amountKes: 1000,
      championship: { level: "OPEN_TOURNAMENT", tenantId: "tenant-1", isPublished: true },
    });
    tenantFindUnique.mockResolvedValue({ subaccountStatus: "ACTIVE", paystackSubaccountCode: "ACCT_123" });

    const res = await POST(req(TEAM_FEE_BODY));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.authorizationUrl).toBe("https://paystack.com/pay/abc");
    expect(initializePaystackTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({ subaccount: "ACCT_123" }),
    );
  });

  it("does not require or look up a payout account for non-open-tournament (school-ladder) championships", async () => {
    championshipFeeFindUnique.mockResolvedValue({
      id: "fee-1",
      championshipId: "champ-1",
      amountKes: 1000,
      championship: { level: "COUNTY", tenantId: "tenant-1", isPublished: true },
    });

    const res = await POST(req(TEAM_FEE_BODY));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.authorizationUrl).toBe("https://paystack.com/pay/abc");
    expect(tenantFindUnique).not.toHaveBeenCalled();
    expect(initializePaystackTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({ subaccount: undefined }),
    );
  });

  it("rejects fees belonging to an unpublished championship", async () => {
    championshipFeeFindUnique.mockResolvedValue({
      id: "fee-1",
      championshipId: "champ-1",
      amountKes: 1000,
      championship: { level: "OPEN_TOURNAMENT", tenantId: "tenant-1", isPublished: false },
    });

    const res = await POST(req(TEAM_FEE_BODY));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(tournamentTeamCreate).not.toHaveBeenCalled();
    expect(initializePaystackTransactionMock).not.toHaveBeenCalled();
  });

  it("rejects paying with a team from a different championship", async () => {
    championshipFeeFindUnique.mockResolvedValue({
      id: "fee-1",
      championshipId: "champ-1",
      amountKes: 1000,
      championship: { level: "COUNTY", tenantId: "tenant-1", isPublished: true },
    });
    tournamentTeamFindUnique.mockResolvedValue({ id: "team-9", name: "Other", championshipId: "champ-2" });

    const res = await POST(req(TEAM_FEE_BODY));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(teamFeePaymentCreate).not.toHaveBeenCalled();
  });

  it("defers creating a self-registered open-tournament team until payment is confirmed", async () => {
    championshipFeeFindUnique.mockResolvedValue({
      id: "fee-1",
      championshipId: "champ-1",
      amountKes: 1000,
      championship: { level: "OPEN_TOURNAMENT", tenantId: "tenant-1", isPublished: true },
    });
    tenantFindUnique.mockResolvedValue({ subaccountStatus: "ACTIVE", paystackSubaccountCode: "ACCT_123" });
    tournamentTeamFindFirst.mockResolvedValue(null);

    const { teamId: _teamId, ...body } = TEAM_FEE_BODY;
    const res = await POST(req({ ...body, teamName: "Thunder FC", teamCode: "THU" }));

    expect(res.status).toBe(200);
    expect(tournamentTeamCreate).not.toHaveBeenCalled();
    expect(teamFeePaymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        teamId: null,
        pendingTeam: expect.objectContaining({ name: "Thunder FC", teamCode: "THU", contactEmail: "manager@example.com" }),
      }),
    });
  });

  it("rejects a self-registration whose team code is already taken", async () => {
    championshipFeeFindUnique.mockResolvedValue({
      id: "fee-1",
      championshipId: "champ-1",
      amountKes: 1000,
      championship: { level: "OPEN_TOURNAMENT", tenantId: "tenant-1", isPublished: true },
    });
    tenantFindUnique.mockResolvedValue({ subaccountStatus: "ACTIVE", paystackSubaccountCode: "ACCT_123" });
    tournamentTeamFindFirst.mockResolvedValue({ teamCode: "THU" });

    const { teamId: _teamId, ...body } = TEAM_FEE_BODY;
    const res = await POST(req({ ...body, teamName: "Thunder FC", teamCode: "THU" }));
    const json = await res.json();

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(json.error).toMatch(/team code/i);
    expect(teamFeePaymentCreate).not.toHaveBeenCalled();
    expect(initializePaystackTransactionMock).not.toHaveBeenCalled();
  });

  it("does not let anonymous callers create new teams in school-ladder championships", async () => {
    championshipFeeFindUnique.mockResolvedValue({
      id: "fee-1",
      championshipId: "champ-1",
      amountKes: 1000,
      championship: { level: "COUNTY", tenantId: "tenant-1", isPublished: true },
    });

    const { teamId: _teamId, ...body } = TEAM_FEE_BODY;
    const res = await POST(req({ ...body, teamName: "New Team", teamCode: "NT" }));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(tournamentTeamCreate).not.toHaveBeenCalled();
  });
});
