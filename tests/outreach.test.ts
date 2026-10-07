import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
const { sendSms, smsTextFor, toInternationalKenyan } = await import("@/lib/sms");

const fetchMock = vi.fn();
function atReply(recipients: { number: string; statusCode: number; status: string; messageId?: string }[]) {
  return { ok: true, status: 201, text: async () => JSON.stringify({ SMSMessageData: { Message: "Sent", Recipients: recipients } }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AT_USERNAME = "zaroda";
  process.env.AT_API_KEY = "key";
  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_FROM = "Zaroda Sports <noreply@zarodasports.live>";
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("SMS through Africa's Talking", () => {
  it("formats Kenyan numbers internationally", () => {
    expect(toInternationalKenyan("0712 345 678")).toBe("+254712345678");
    expect(toInternationalKenyan("254112345678")).toBe("+254112345678");
    expect(toInternationalKenyan("12345")).toBeNull();
  });

  it("sends to many numbers in one request and reads each result", async () => {
    fetchMock.mockResolvedValue(
      atReply([
        { number: "+254712345678", statusCode: 101, status: "Success", messageId: "ATXid_1" },
        { number: "+254722000000", statusCode: 403, status: "InvalidPhoneNumber" },
      ]),
    );
    const results = await sendSms(["+254712345678", "+254722000000"], "Hello");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.africastalking.com/version1/messaging");
    expect(String(init.body)).toContain("to=%2B254712345678%2C%2B254722000000");
    expect(results).toEqual([
      { number: "+254712345678", sent: true, messageId: "ATXid_1" },
      { number: "+254722000000", sent: false, messageId: undefined, error: "InvalidPhoneNumber" },
    ]);
  });

  it("uses the sandbox for the sandbox account", async () => {
    process.env.AT_USERNAME = "sandbox";
    fetchMock.mockResolvedValue(atReply([{ number: "+254712345678", statusCode: 101, status: "Success" }]));
    await sendSms(["+254712345678"], "Hello");
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.sandbox.africastalking.com/version1/messaging");
  });

  it("reports, rather than throws, when it isn't set up", async () => {
    delete process.env.AT_API_KEY;
    expect(await sendSms(["+254712345678"], "Hello")).toEqual([
      { number: "+254712345678", sent: false, error: "SMS isn't set up yet (AT_USERNAME / AT_API_KEY)" },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps an SMS within three segments, signed off", () => {
    const text = smsTextFor({ subject: "Fees", body: "x".repeat(1000) });
    expect(text.length).toBeLessThanOrEqual(459);
    expect(text.endsWith("... - Zaroda Sports")).toBe(true);
    expect(smsTextFor({ subject: "Hi", body: "Long", smsText: "Short version" })).toBe("Short version - Zaroda Sports");
  });
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
        body: JSON.stringify({ audience: "ALL", email: true, sms: true, subject: "Fees due", body: "Please pay by Friday.", ...body }),
      }),
    );
  }

  beforeEach(() => {
    tenantFindMany.mockResolvedValue(tenants);
    messageFindMany.mockResolvedValue([{ id: "m1", recipientId: "u1" }, { id: "m2", recipientId: "u2" }]);
    batchSend.mockResolvedValue({ data: {}, error: null });
    fetchMock.mockResolvedValue(atReply([{ number: "+254712345678", statusCode: 101, status: "Success", messageId: "ATXid_1" }]));
  });

  it("puts it in every tenant's inbox, emails them, texts valid numbers, and logs each delivery", async () => {
    const res = await send({});
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ tenants: 2, email: { sent: 2, failed: 0 }, sms: { sent: 1, failed: 0, skipped: 1 } });
    expect(messageCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ senderId: "owner-admin", recipientId: "u1", subject: "Fees due" }),
        expect.objectContaining({ recipientId: "u2" }),
      ],
    });
    expect(batchSend.mock.calls[0]![0]).toHaveLength(2);
    expect(batchSend.mock.calls[0]![0][0]).toMatchObject({ to: "jane@school.ke", subject: "Fees due - Zaroda Sports" });
    expect(deliveryCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ messageId: "m1", channel: "SMS", recipient: "+254712345678", status: "SENT", providerId: "ATXid_1" }),
        expect.objectContaining({ messageId: "m2", channel: "SMS", status: "SKIPPED", error: "Not a Kenyan mobile number" }),
        expect.objectContaining({ messageId: "m1", channel: "EMAIL", status: "SENT" }),
      ]),
    });
  });

  it("only goes in the inbox when email and SMS aren't ticked", async () => {
    const res = await send({ email: false, sms: false });
    expect(await res.json()).toMatchObject({ tenants: 2, email: null, sms: null });
    expect(batchSend).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
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
