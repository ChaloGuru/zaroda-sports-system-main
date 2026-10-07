import { describe, it, expect, vi, beforeEach } from "vitest";

const tenantFindMany = vi.fn();
const messageCreateMany = vi.fn();
const messageFindMany = vi.fn();
const deliveryCreateMany = vi.fn();
const batchSend = vi.fn();

vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: "owner-admin", tenantId: null, roles: [{ role: "SUPER_ADMIN", championshipId: null }] } }),
}));
vi.mock("resend", () => ({ Resend: class { batch = { send: (...a: unknown[]) => batchSend(...a) }; emails = { send: vi.fn() }; } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findMany: (...a: unknown[]) => tenantFindMany(...a) },
    adminMessage: { createMany: (...a: unknown[]) => messageCreateMany(...a), findMany: (...a: unknown[]) => messageFindMany(...a) },
    messageDelivery: { createMany: (...a: unknown[]) => deliveryCreateMany(...a) },
    auditLog: { create: vi.fn() },
  },
}));

const { POST } = await import("@/app/api/admin/outreach/route");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_FROM = "Zaroda Sports <noreply@zarodasports.live>";
});

describe("messaging tenants", () => {
  const tenants = [
    { id: "t1", organizationName: "Manyonge Primary", contactName: "Jane", email: "jane@school.ke", phone: "0712345678", userId: "u1" },
    { id: "t2", organizationName: "Kisumu Boys", contactName: "Otieno", email: "otieno@school.ke", phone: "not a phone", userId: "u2" },
  ];

  function send(body: Record<string, unknown>) {
    return POST(
      new Request("http://localhost/api/admin/outreach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audience: "ALL", email: true, subject: "Fees due", body: "Please pay by Friday.", ...body }),
      }),
    );
  }

  beforeEach(() => {
    tenantFindMany.mockResolvedValue(tenants);
    messageFindMany.mockResolvedValue([{ id: "m1", recipientId: "u1" }, { id: "m2", recipientId: "u2" }]);
    batchSend.mockResolvedValue({ data: {}, error: null });
  });

  it("puts it in every tenant's inbox, emails them, and logs each email", async () => {
    const res = await send({});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ batchId: expect.any(String), tenants: 2, email: { sent: 2, failed: 0 } });
    expect(messageCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ senderId: "owner-admin", recipientId: "u1", subject: "Fees due" }),
        expect.objectContaining({ recipientId: "u2" }),
      ],
    });
    expect(batchSend.mock.calls[0]![0]).toHaveLength(2);
    expect(batchSend.mock.calls[0]![0][0]).toMatchObject({ to: "jane@school.ke", subject: "Fees due - Zaroda Sports" });
    expect(deliveryCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ messageId: "m1", channel: "EMAIL", recipient: "jane@school.ke", status: "SENT" }),
        expect.objectContaining({ messageId: "m2", channel: "EMAIL", recipient: "otieno@school.ke", status: "SENT" }),
      ],
    });
  });

  it("only goes in the inbox when email isn't ticked", async () => {
    const res = await send({ email: false });
    expect(await res.json()).toMatchObject({ tenants: 2, email: null });
    expect(batchSend).not.toHaveBeenCalled();
  });

  it("logs an email the service refused", async () => {
    batchSend.mockResolvedValue({ data: null, error: { name: "validation_error", message: "The domain is not verified" } });
    const res = await send({});
    expect(await res.json()).toMatchObject({ email: { sent: 0, failed: 2 } });
    expect(deliveryCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([expect.objectContaining({ status: "FAILED", error: "The domain is not verified" })]),
    });
  });

  it("targets one county", async () => {
    await send({ audience: "COUNTY", county: "Kisumu" });
    expect(tenantFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { county: { equals: "Kisumu", mode: "insensitive" } } }));
  });

  it("needs a county or chosen tenants for those audiences", async () => {
    expect((await send({ audience: "COUNTY" })).status).toBe(400);
    expect((await send({ audience: "TENANTS", tenantIds: [] })).status).toBe(400);
  });
});
