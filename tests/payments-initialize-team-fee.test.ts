import { describe, it, expect, vi, beforeEach } from "vitest";

const stkPush = vi.fn();
const championshipFeeFindUnique = vi.fn();
const tenantFindUnique = vi.fn();
const tournamentTeamFindUnique = vi.fn();
const tournamentTeamFindFirst = vi.fn();
const teamFeePaymentCreate = vi.fn();
const teamFeePaymentUpdate = vi.fn();
const teamFeePaymentFindFirst = vi.fn();

process.env.TUMA_EMAIL = "zaroda@example.com";
process.env.TUMA_API_KEY = "zaroda-key";
process.env.NEXTAUTH_SECRET = "test-secret";

vi.mock("@/lib/tuma", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tuma")>("@/lib/tuma");
  return { ...actual, tumaStkPush: (...a: unknown[]) => stkPush(...a) };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    championshipFee: { findUnique: (...a: unknown[]) => championshipFeeFindUnique(...a) },
    tenant: { findUnique: (...a: unknown[]) => tenantFindUnique(...a) },
    tournamentTeam: { findUnique: (...a: unknown[]) => tournamentTeamFindUnique(...a), findFirst: (...a: unknown[]) => tournamentTeamFindFirst(...a) },
    teamFeePayment: {
      create: (...a: unknown[]) => teamFeePaymentCreate(...a),
      update: (...a: unknown[]) => teamFeePaymentUpdate(...a),
      findFirst: (...a: unknown[]) => teamFeePaymentFindFirst(...a),
    },
  },
}));

const { POST } = await import("@/app/api/payments/initialize/route");
const { encryptSecret } = await import("@/lib/secret-box");

let ip = 0;
function req(body: unknown): Request {
  return new Request("http://localhost/api/payments/initialize", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.1.0.${++ip % 250}` },
    body: JSON.stringify(body),
  });
}

const BODY = {
  mode: "team_fee" as const,
  feeId: "11111111-1111-1111-1111-111111111111",
  teamId: "22222222-2222-2222-2222-222222222222",
  contactEmail: "manager@example.com",
  contactPhone: "0712 345 678",
};
const fee = (level: string, isPublished = true) => ({
  id: "fee-1",
  name: "Entry fee",
  championshipId: "champ-1",
  amountKes: 1500,
  championship: { level, tenantId: "tenant-1", isPublished, name: "Uriri Open" },
});

describe("POST /api/payments/initialize (team fee by M-Pesa)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stkPush.mockResolvedValue({ checkout_request_id: "ws_CO_1" });
    tournamentTeamFindUnique.mockResolvedValue({ id: "team-1", name: "Team A", championshipId: "champ-1" });
    teamFeePaymentCreate.mockResolvedValue({ id: "payment-1" });
    teamFeePaymentFindFirst.mockResolvedValue(null);
  });

  it("blocks payment when the open-tournament manager has not connected TUMA", async () => {
    championshipFeeFindUnique.mockResolvedValue(fee("OPEN_TOURNAMENT"));
    tenantFindUnique.mockResolvedValue({ subaccountStatus: "NOT_CONFIGURED", tumaEmail: null, tumaApiKeyEncrypted: null });
    const res = await POST(req(BODY));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await res.json()).error).toMatch(/TUMA/);
    expect(stkPush).not.toHaveBeenCalled();
  });

  it("sends the prompt from the manager's own TUMA account for an open tournament", async () => {
    championshipFeeFindUnique.mockResolvedValue(fee("OPEN_TOURNAMENT"));
    tenantFindUnique.mockResolvedValue({ subaccountStatus: "ACTIVE", tumaEmail: "jane@example.com", tumaApiKeyEncrypted: encryptSecret("jane-key") });
    const res = await POST(req(BODY));
    expect(res.status).toBe(200);
    const [push, account] = stkPush.mock.calls[0]!;
    expect(account).toEqual({ email: "jane@example.com", apiKey: "jane-key" });
    expect(push).toMatchObject({ amount: 1500, phone: "254712345678" });
    expect(push.callbackUrl).toMatch(/\/api\/payments\/tuma-callback\?fee=payment-1&key=[0-9a-f]{64}$/);
    expect(teamFeePaymentCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ provider: "TUMA", phone: "254712345678", status: "PENDING", callbackSecretHash: expect.any(String) }) });
    expect(teamFeePaymentUpdate).toHaveBeenCalledWith({ where: { id: "payment-1" }, data: { checkoutRequestId: "ws_CO_1" } });
  });

  it("uses Zaroda's account for a school-ladder championship, without a payout account", async () => {
    championshipFeeFindUnique.mockResolvedValue(fee("ZONE"));
    const res = await POST(req(BODY));
    expect(res.status).toBe(200);
    expect(tenantFindUnique).not.toHaveBeenCalled();
    expect(stkPush.mock.calls[0]![1]).toBeUndefined();
  });

  it("needs an M-Pesa number", async () => {
    championshipFeeFindUnique.mockResolvedValue(fee("ZONE"));
    const res = await POST(req({ ...BODY, contactPhone: "12" }));
    expect(res.status).toBe(400);
    expect(stkPush).not.toHaveBeenCalled();
  });

  it("marks the payment FAILED if TUMA refuses the prompt", async () => {
    championshipFeeFindUnique.mockResolvedValue(fee("ZONE"));
    stkPush.mockRejectedValue(new Error("Invalid phone"));
    const res = await POST(req(BODY));
    expect(res.status).toBe(502);
    expect(teamFeePaymentUpdate).toHaveBeenCalledWith({ where: { id: "payment-1" }, data: { status: "FAILED", message: "Invalid phone" } });
  });

  it("rejects fees belonging to an unpublished championship", async () => {
    championshipFeeFindUnique.mockResolvedValue(fee("ZONE", false));
    const res = await POST(req(BODY));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(teamFeePaymentCreate).not.toHaveBeenCalled();
  });

  it("rejects paying with a team from a different championship", async () => {
    championshipFeeFindUnique.mockResolvedValue(fee("ZONE"));
    tournamentTeamFindUnique.mockResolvedValue({ id: "team-1", championshipId: "other" });
    const res = await POST(req(BODY));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(teamFeePaymentCreate).not.toHaveBeenCalled();
  });

  it("defers creating a self-registered open-tournament team until payment is confirmed", async () => {
    championshipFeeFindUnique.mockResolvedValue(fee("OPEN_TOURNAMENT"));
    tenantFindUnique.mockResolvedValue({ subaccountStatus: "ACTIVE", tumaEmail: "jane@example.com", tumaApiKeyEncrypted: encryptSecret("jane-key") });
    tournamentTeamFindFirst.mockResolvedValue(null);
    const res = await POST(req({ ...BODY, teamId: undefined, teamName: "Thunder FC", teamCode: "THU" }));
    expect(res.status).toBe(200);
    expect(teamFeePaymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ teamId: null, pendingTeam: expect.objectContaining({ name: "Thunder FC", teamCode: "THU", contactPhone: "254712345678" }) }),
    });
  });

  it("rejects a self-registration whose team code is already taken", async () => {
    championshipFeeFindUnique.mockResolvedValue(fee("OPEN_TOURNAMENT"));
    tenantFindUnique.mockResolvedValue({ subaccountStatus: "ACTIVE", tumaEmail: "jane@example.com", tumaApiKeyEncrypted: encryptSecret("jane-key") });
    tournamentTeamFindFirst.mockResolvedValue({ teamCode: "THU" });
    const res = await POST(req({ ...BODY, teamId: undefined, teamName: "Thunder FC", teamCode: "THU" }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(teamFeePaymentCreate).not.toHaveBeenCalled();
  });

  it("does not let anonymous callers create new teams in school-ladder championships", async () => {
    championshipFeeFindUnique.mockResolvedValue(fee("ZONE"));
    const res = await POST(req({ ...BODY, teamId: undefined, teamName: "Thunder FC", teamCode: "THU" }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(teamFeePaymentCreate).not.toHaveBeenCalled();
  });

  it("won't send a second prompt to the same phone within two minutes", async () => {
    championshipFeeFindUnique.mockResolvedValue(fee("ZONE"));
    teamFeePaymentFindFirst.mockResolvedValue({ id: "earlier" });
    const res = await POST(req(BODY));
    expect(res.status).toBe(429);
    expect(stkPush).not.toHaveBeenCalled();
  });
});
