import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => send(...args) };
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  send.mockReset();
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("sendEmail", () => {
  it("skips (without throwing) when Resend isn't configured", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    const { sendEmail } = await import("@/lib/email");
    await expect(sendEmail({ to: "a@b.co", subject: "s", html: "h", text: "t" })).resolves.toMatchObject({ sent: false });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends from EMAIL_FROM when configured", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "Zaroda Sports <noreply@zarodasports.live>";
    send.mockResolvedValue({ data: { id: "1" }, error: null });
    const { sendEmail } = await import("@/lib/email");
    await expect(sendEmail({ to: "judge@x.co", subject: "Hi", html: "<p>Hi</p>", text: "Hi" })).resolves.toEqual({ sent: true });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ from: "Zaroda Sports <noreply@zarodasports.live>", to: "judge@x.co" }));
  });

  it("reports Resend's rejection instead of throwing", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "noreply@zarodasports.live";
    send.mockResolvedValue({ data: null, error: { name: "validation_error", message: "The domain is not verified" } });
    const { sendEmail } = await import("@/lib/email");
    await expect(sendEmail({ to: "judge@x.co", subject: "s", html: "h", text: "t" })).resolves.toEqual({ sent: false, error: "The domain is not verified" });
  });
});
