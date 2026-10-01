import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import type { JWT } from "next-auth/jwt";

const userFindUnique = vi.fn();

// Minimal in-memory stand-in for the login_attempts table, so the real
// counting/window logic in lib/auth.ts is exercised.
interface AttemptRow {
  email: string;
  ip: string;
  succeeded: boolean;
  createdAt: Date;
}
let attempts: AttemptRow[] = [];
type AttemptWhere = Partial<{ email: string; ip: string; succeeded: boolean; createdAt: { gt?: Date; lt?: Date } }>;
function matches(row: AttemptRow, where: AttemptWhere): boolean {
  if (where.email !== undefined && row.email !== where.email) return false;
  if (where.ip !== undefined && row.ip !== where.ip) return false;
  if (where.succeeded !== undefined && row.succeeded !== where.succeeded) return false;
  if (where.createdAt?.gt && !(row.createdAt > where.createdAt.gt)) return false;
  if (where.createdAt?.lt && !(row.createdAt < where.createdAt.lt)) return false;
  return true;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    loginAttempt: {
      count: async ({ where }: { where: AttemptWhere }) => attempts.filter((r) => matches(r, where)).length,
      create: async ({ data }: { data: Omit<AttemptRow, "createdAt"> }) => {
        attempts.push({ ...data, createdAt: new Date() });
      },
      deleteMany: async ({ where }: { where: AttemptWhere }) => {
        attempts = attempts.filter((r) => !matches(r, where));
      },
    },
  },
}));

const { authOptions } = await import("@/lib/auth");

const EMAIL = "user@example.com";
const PASSWORD = "Correct-horse1";
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

type AuthorizeFn = (credentials: Record<string, string>, req: { headers: Record<string, string> }) => Promise<unknown>;
const provider = authOptions.providers[0] as unknown as { options: { authorize: AuthorizeFn } };

// Unique IP prefix per test so the separate in-memory per-IP limiter (which
// persists across tests in this module) never interferes.
let testRun = 0;
let prefix = "";
function ipOf(n: number) {
  return `${prefix}.${n}`;
}
function authorize(password: string, ip: string) {
  return provider.options.authorize({ email: EMAIL, password }, { headers: { "x-forwarded-for": ip } });
}
function seedFailures(ip: string, count: number) {
  for (let i = 0; i < count; i++) attempts.push({ email: EMAIL, ip, succeeded: false, createdAt: new Date() });
}

function dbUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: EMAIL,
    name: "User",
    passwordHash: PASSWORD_HASH,
    tenant: { id: "tenant-1" },
    roles: [{ role: "TENANT_OWNER", championshipId: null, organizationName: null, gameCategory: null, ballSport: null, athleticsType: null }],
    ...overrides,
  };
}

const jwt = authOptions.callbacks!.jwt! as (args: { token: JWT; user?: unknown }) => Promise<JWT>;

beforeEach(() => {
  vi.clearAllMocks();
  attempts = [];
  testRun++;
  prefix = `10.${testRun}.0`;
  userFindUnique.mockResolvedValue(dbUser());
});

describe("credentials sign-in brute-force protection", () => {
  it("records failed attempts for unknown emails too, so limits don't reveal which emails exist", async () => {
    userFindUnique.mockResolvedValue(null);
    await expect(authorize(PASSWORD, ipOf(1))).resolves.toBeNull();
    expect(attempts).toEqual([expect.objectContaining({ email: EMAIL, ip: ipOf(1), succeeded: false })]);
  });

  it("blocks a network after 10 failures for that account, even with the right password", async () => {
    seedFailures(ipOf(1), 10);
    await expect(authorize(PASSWORD, ipOf(1))).rejects.toThrow(/your network/i);
  });

  it("does not lock the real user out of their own network when an attacker guesses from another", async () => {
    seedFailures(ipOf(66), 10);
    const user = (await authorize(PASSWORD, ipOf(1))) as { id: string };
    expect(user.id).toBe("user-1");
  });

  it("blocks unfamiliar networks once failures across many networks pass the account-wide ceiling", async () => {
    for (let n = 100; n < 120; n++) seedFailures(ipOf(n), 5); // 100 failures spread over 20 IPs
    await expect(authorize(PASSWORD, ipOf(1))).rejects.toThrow(/network you've used before/i);
  });

  it("still admits a network the account recently signed in from, even past the account-wide ceiling", async () => {
    attempts.push({ email: EMAIL, ip: ipOf(1), succeeded: true, createdAt: new Date() });
    for (let n = 100; n < 120; n++) seedFailures(ipOf(n), 5);
    const user = (await authorize(PASSWORD, ipOf(1))) as { id: string };
    expect(user.id).toBe("user-1");
  });

  it("signs in and clears that network's failures on success", async () => {
    seedFailures(ipOf(1), 3);
    seedFailures(ipOf(2), 3);
    const user = (await authorize(PASSWORD, ipOf(1))) as { id: string; passwordFingerprint: string };
    expect(user.id).toBe("user-1");
    expect(user.passwordFingerprint).toHaveLength(16);
    expect(attempts.filter((r) => r.ip === ipOf(1) && !r.succeeded)).toHaveLength(0);
    expect(attempts.filter((r) => r.ip === ipOf(2) && !r.succeeded)).toHaveLength(3);
  });
});

describe("session refresh and revocation", () => {
  async function signedInToken(): Promise<JWT> {
    const user = await authorize(PASSWORD, ipOf(1));
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
