import { describe, it, expect, vi, beforeEach } from "vitest";

const messageFindUnique = vi.fn();
const messageCreate = vi.fn();
const queryRaw = vi.fn();
const requireAuth = vi.fn();

vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/authorize", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authorize")>("@/lib/authorize");
  return { ...actual, requireAuth: (...a: unknown[]) => requireAuth(...a) };
});
const tx = { adminMessage: { create: (...a: unknown[]) => messageCreate(...a) }, auditLog: { create: vi.fn() } };
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminMessage: { findUnique: (...a: unknown[]) => messageFindUnique(...a) },
    rateLimitHit: { deleteMany: vi.fn() },
    $queryRaw: (...a: unknown[]) => queryRaw(...a),
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

const { POST: sendMessage } = await import("@/app/api/messages/route");
const { rateLimit } = await import("@/lib/rate-limit");

const ADMIN = "11111111-1111-1111-1111-111111111111";
const OWNER = "22222222-2222-2222-2222-222222222222";
const STRANGER = "33333333-3333-3333-3333-333333333333";
const THREAD = "44444444-4444-4444-4444-444444444444";

const as = (userId: string, superAdmin = false) =>
  requireAuth.mockResolvedValue({ userId, tenantId: null, roles: superAdmin ? [{ role: "SUPER_ADMIN", championshipId: null }] : [] });
function send(body: Record<string, unknown>) {
  return sendMessage(
    new Request("http://localhost/api/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject: "Hi", body: "Hello", ...body }),
    }),
  );
}

describe("direct messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: "m-new", ...data }));
  });

  it("lets a super admin write to anyone", async () => {
    as(ADMIN, true);
    expect((await send({ recipientId: OWNER })).status).toBe(201);
    expect(messageCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ recipientId: OWNER }) });
  });

  it("doesn't let anyone else start a conversation", async () => {
    as(OWNER);
    const res = await send({ recipientId: STRANGER });
    expect(res.status).toBe(403);
    expect(messageCreate).not.toHaveBeenCalled();
  });

  it("sends a reply back to whoever wrote, whatever recipient was asked for", async () => {
    as(OWNER);
    messageFindUnique.mockResolvedValue({ senderId: ADMIN, recipientId: OWNER, isBroadcast: false });
    expect((await send({ parentId: THREAD, recipientId: STRANGER })).status).toBe(201);
    expect(messageCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ recipientId: ADMIN, parentId: THREAD }) });
  });

  it("refuses replies into someone else's conversation", async () => {
    as(STRANGER);
    messageFindUnique.mockResolvedValue({ senderId: ADMIN, recipientId: OWNER, isBroadcast: false });
    expect((await send({ parentId: THREAD })).status).toBe(404);
    expect(messageCreate).not.toHaveBeenCalled();
  });

  it("lets anyone reply to a broadcast, to the super admin who sent it", async () => {
    as(STRANGER);
    messageFindUnique.mockResolvedValue({ senderId: ADMIN, recipientId: null, isBroadcast: true });
    expect((await send({ parentId: THREAD })).status).toBe(201);
    expect(messageCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ recipientId: ADMIN }) });
  });
});

describe("shared rate limits", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the database count shared by every server instance", async () => {
    queryRaw.mockResolvedValueOnce([{ count: 5 }]).mockResolvedValueOnce([{ count: 6 }]);
    expect((await rateLimit("signup:1.2.3.4", 5, 60_000)).allowed).toBe(true);
    expect((await rateLimit("signup:1.2.3.4", 5, 60_000)).allowed).toBe(false);
  });

  it("falls back to this instance's count if the database is unavailable", async () => {
    queryRaw.mockRejectedValue(new Error("P1001"));
    const results = [];
    for (let i = 0; i < 3; i++) results.push((await rateLimit("contact:9.9.9.9", 2, 60_000)).allowed);
    expect(results).toEqual([true, true, false]);
  });
});
