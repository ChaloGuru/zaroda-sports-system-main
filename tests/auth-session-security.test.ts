import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import type { JWT } from "next-auth/jwt";

const userFindUnique = vi.fn();
const userUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      update: (...args: unknown[]) => userUpdate(...args),
    },
  },
}));

const { authOptions } = await import("@/lib/auth");

const PASSWORD = "Correct-horse1";
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

type AuthorizeFn = (credentials: Record<string, string>, req: { headers: Record<string, string> }) => Promise<unknown>;
const provider = authOptions.providers[0] as unknown as { options: { authorize: AuthorizeFn } };
let ipCounter = 0;
function authorize(password: string) {
  // Fresh IP per call so the in-memory per-IP limiter never interferes with account-lockout tests.
  ipCounter++;
  return provider.options.authorize({ email: "user@example.com", password }, { headers: { "x-forwarded-for": `10.0.0.${ipCounter}` } });
}

function dbUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "user@example.com",
    name: "User",
    passwordHash: PASSWORD_HASH,
    failedLoginAttempts: 0,
    lockedUntil: null,
    tenant: { id: "tenant-1" },
    roles: [{ role: "TENANT_OWNER", championshipId: null, organizationName: null, gameCategory: null, ballSport: null, athleticsType: null }],
    ...overrides,
  };
}

const jwt = authOptions.callbacks!.jwt! as (args: { token: JWT; user?: unknown }) => Promise<JWT>;

describe("credentials sign-in lockout", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null for an unknown email without touching any user row", async () => {
    userFindUnique.mockResolvedValue(null);
    await expect(authorize(PASSWORD)).resolves.toBeNull();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("counts a failed attempt", async () => {
    userFindUnique.mockResolvedValue(dbUser());
    userUpdate.mockResolvedValue({ failedLoginAttempts: 1 });
    await expect(authorize("wrong-password1")).resolves.toBeNull();
    expect(userUpdate).toHaveBeenCalledTimes(1);
    expect(userUpdate.mock.calls[0]![0].data).toEqual({ failedLoginAttempts: { increment: 1 } });
  });

  it("locks the account on the 10th consecutive failure", async () => {
    userFindUnique.mockResolvedValue(dbUser({ failedLoginAttempts: 9 }));
    userUpdate.mockResolvedValue({ failedLoginAttempts: 10 });
    await authorize("wrong-password1");
    const lockCall = userUpdate.mock.calls[1]![0];
    expect(lockCall.data.failedLoginAttempts).toBe(0);
    expect(lockCall.data.lockedUntil.getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects even the correct password while locked", async () => {
    userFindUnique.mockResolvedValue(dbUser({ lockedUntil: new Date(Date.now() + 60_000) }));
    await expect(authorize(PASSWORD)).rejects.toThrow(/locked/i);
  });

  it("signs in and clears the failure counter on success", async () => {
    userFindUnique.mockResolvedValue(dbUser({ failedLoginAttempts: 3 }));
    const user = (await authorize(PASSWORD)) as { id: string; passwordFingerprint: string };
    expect(user.id).toBe("user-1");
    expect(user.passwordFingerprint).toHaveLength(16);
    expect(userUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { failedLoginAttempts: 0, lockedUntil: null } }));
  });
});

describe("session refresh and revocation", () => {
  beforeEach(() => vi.clearAllMocks());

  async function signedInToken(): Promise<JWT> {
    userFindUnique.mockResolvedValue(dbUser());
    const user = await authorize(PASSWORD);
    return jwt({ token: {} as JWT, user });
  }

  it("does not hit the database within the refresh window", async () => {
    const token = await signedInToken();
    userFindUnique.mockClear();
    await jwt({ token });
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("picks up role changes after the refresh window", async () => {
    const token = await signedInToken();
    userFindUnique.mockResolvedValue(dbUser({ roles: [] }));
    const refreshed = await jwt({ token: { ...token, refreshedAt: Date.now() - 61_000 } });
    expect(refreshed.id).toBe("user-1");
    expect(refreshed.roles).toEqual([]);
  });

  it("revokes the session after a password change", async () => {
    const token = await signedInToken();
    userFindUnique.mockResolvedValue(dbUser({ passwordHash: bcrypt.hashSync("Another-pass1", 4) }));
    const refreshed = await jwt({ token: { ...token, refreshedAt: Date.now() - 61_000 } });
    expect(refreshed.id).toBeUndefined();
  });

  it("revokes the session when the user no longer exists", async () => {
    const token = await signedInToken();
    userFindUnique.mockResolvedValue(null);
    const refreshed = await jwt({ token: { ...token, refreshedAt: Date.now() - 61_000 } });
    expect(refreshed.id).toBeUndefined();
  });
});
