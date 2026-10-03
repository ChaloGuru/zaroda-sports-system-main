import { describe, it, expect, vi, beforeEach } from "vitest";

const userFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: (...args: unknown[]) => userFindUnique(...args) } } }));

process.env.NEXTAUTH_SECRET = "test-secret";
process.env.PUBLIC_SITE_URL = "https://zaroda.example/";

const { createSetupToken, findSetupUser, setupUrl, SETUP_TTL_DAYS } = await import("@/lib/account-setup");

const USER = { id: "user-1", email: "official@example.com", name: "Official", passwordHash: "$2a$12$original-hash" };

describe("account setup links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindUnique.mockResolvedValue(USER);
  });

  it("resolves a fresh link to its user", async () => {
    expect(await findSetupUser(createSetupToken(USER))).toEqual(USER);
  });

  it("stops working once the password has been set", async () => {
    const token = createSetupToken(USER);
    userFindUnique.mockResolvedValue({ ...USER, passwordHash: "$2a$12$new-hash" });
    expect(await findSetupUser(token)).toBeNull();
  });

  it("rejects a link whose user id was swapped", async () => {
    const [encoded, signature] = createSetupToken(USER).split(".");
    const payload = JSON.parse(Buffer.from(encoded!, "base64url").toString("utf8"));
    const forged = Buffer.from(JSON.stringify({ ...payload, u: "someone-else" })).toString("base64url");
    expect(await findSetupUser(`${forged}.${signature}`)).toBeNull();
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("rejects an expired link", async () => {
    const issued = Date.now() - (SETUP_TTL_DAYS * 86_400_000 + 1);
    expect(await findSetupUser(createSetupToken(USER, issued))).toBeNull();
  });

  it("rejects malformed tokens", async () => {
    expect(await findSetupUser("")).toBeNull();
    expect(await findSetupUser("not-a-token")).toBeNull();
    expect(await findSetupUser("abc.def")).toBeNull();
  });

  it("builds the link from PUBLIC_SITE_URL, never the request host", () => {
    expect(setupUrl("tok")).toBe("https://zaroda.example/account/setup/tok");
  });
});
