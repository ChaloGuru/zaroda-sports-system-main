import { createHash } from "crypto";
import type { NextAuthOptions, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { rateLimit } from "./rate-limit";
import type { AthleticsType, BallSport, GameCategory, Role, UserRole } from "@prisma/client";

export interface SessionRole {
  role: Role;
  championshipId: string | null;
  /** Only set for TEAM_MANAGER - the organization this role is scoped to. */
  organizationName: string | null;
  /** Optional sport/discipline scoping - null in a field means unscoped for that dimension. */
  gameCategory: GameCategory | null;
  ballSport: BallSport | null;
  athleticsType: AthleticsType | null;
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      tenantId: string | null;
      roles: SessionRole[];
    };
  }
  interface User {
    id: string;
    email: string;
    name: string;
    tenantId: string | null;
    roles: SessionRole[];
    passwordFingerprint?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    tenantId: string | null;
    roles: SessionRole[];
    /** Fingerprint of the password hash at sign-in - see passwordFingerprint(). */
    pwd?: string;
    /** Epoch ms of the last roles/tenant refresh from the database. */
    refreshedAt?: number;
  }
}

/**
 * Brute-force protection (see LoginAttempt in prisma/schema.prisma). Failures
 * are limited per email+IP, so guessing from one network only blocks that
 * network - never the real user signing in from their own. The account-wide
 * ceiling only catches attacks spread across many networks, and even then
 * networks this account has successfully signed in from recently still work.
 */
const MAX_FAILURES_PER_IP = 10;
const PER_IP_WINDOW_MS = 15 * 60_000;
const MAX_FAILURES_PER_ACCOUNT = 100;
const PER_ACCOUNT_WINDOW_MS = 60 * 60_000;
const TRUSTED_NETWORK_MS = 30 * 24 * 60 * 60_000;
/** Per-IP cap on sign-in attempts, across all accounts (password spraying). */
const IP_LOGIN_LIMIT = 30;
const IP_LOGIN_WINDOW_MS = 15 * 60_000;
/** How often a session's roles/tenant are re-read from the database. */
const SESSION_REFRESH_MS = 60_000;
/**
 * bcrypt hash of a random throwaway value - compared against when the email
 * doesn't exist, so response timing doesn't reveal which emails are registered.
 */
const DUMMY_PASSWORD_HASH = "$2a$12$8oDOXsLyhEDLLhH7yC0CVe.3cV7jOFUZ6R4jUT2VCVMNJC2iNhAgq";

/**
 * Short, non-reversible fingerprint of the stored password hash. Kept in the
 * JWT so a password change invalidates every session issued before it.
 */
export function passwordFingerprint(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
}

function toSessionRoles(roles: UserRole[]): SessionRole[] {
  return roles.map((r) => ({
    role: r.role,
    championshipId: r.championshipId,
    organizationName: r.organizationName,
    gameCategory: r.gameCategory,
    ballSport: r.ballSport,
    athleticsType: r.athleticsType,
  }));
}

function clientIpFromHeaders(headers: Record<string, unknown> | undefined): string {
  const forwarded = headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  const realIp = headers?.["x-real-ip"];
  return typeof realIp === "string" && realIp ? realIp : "unknown";
}

/** Throws a user-facing error if this email+IP is currently blocked from signing in. */
async function assertLoginAllowed(email: string, ip: string): Promise<void> {
  const now = Date.now();
  const ipFailures = await prisma.loginAttempt.count({
    where: { email, ip, succeeded: false, createdAt: { gt: new Date(now - PER_IP_WINDOW_MS) } },
  });
  if (ipFailures >= MAX_FAILURES_PER_IP) {
    throw new Error("Too many failed sign-ins for this account from your network. Please try again in 15 minutes.");
  }

  const accountFailures = await prisma.loginAttempt.count({
    where: { email, succeeded: false, createdAt: { gt: new Date(now - PER_ACCOUNT_WINDOW_MS) } },
  });
  if (accountFailures >= MAX_FAILURES_PER_ACCOUNT) {
    const trustedNetwork = await prisma.loginAttempt.count({
      where: { email, ip, succeeded: true, createdAt: { gt: new Date(now - TRUSTED_NETWORK_MS) } },
    });
    if (trustedNetwork === 0) {
      throw new Error(
        "This account is temporarily protected after many failed sign-ins. Please try again later, or sign in from a network you've used before.",
      );
    }
  }
}

async function recordLoginAttempt(email: string, ip: string, succeeded: boolean): Promise<void> {
  await prisma.loginAttempt.create({ data: { email, ip, succeeded } });
  if (succeeded) {
    // A successful sign-in clears this network's failure count for the account.
    await prisma.loginAttempt.deleteMany({ where: { email, ip, succeeded: false } });
  }
  // Occasional pruning keeps the table bounded without a separate cron job.
  if (Math.random() < 0.02) {
    await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - TRUSTED_NETWORK_MS) } } });
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        const ip = clientIpFromHeaders(req?.headers);
        if (!(await rateLimit(`login:${ip}`, IP_LOGIN_LIMIT, IP_LOGIN_WINDOW_MS)).allowed) {
          throw new Error("Too many sign-in attempts. Please wait a few minutes and try again.");
        }

        // Tracked by email whether or not an account exists, so the limits
        // and messages never reveal which emails are registered.
        const email = credentials.email.toLowerCase().trim();
        await assertLoginAllowed(email, ip);

        const user = await prisma.user.findUnique({
          where: { email },
          include: { roles: true, tenant: true },
        });
        const isValid = await bcrypt.compare(credentials.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

        await recordLoginAttempt(email, ip, !!user && isValid);
        if (!user || !isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: user.tenant?.id ?? null,
          roles: toSessionRoles(user.roles),
          passwordFingerprint: passwordFingerprint(user.passwordHash),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.tenantId = user.tenantId;
        token.roles = user.roles;
        token.pwd = user.passwordFingerprint;
        token.refreshedAt = Date.now();
        return token;
      }
      if (!token.id) return token;

      // Periodically re-read roles/tenant so revoked or changed roles take
      // effect within a minute instead of lasting until the JWT expires, and
      // drop the session entirely if the user was deleted or changed their
      // password since this token was issued.
      if (token.refreshedAt && Date.now() - token.refreshedAt < SESSION_REFRESH_MS) return token;

      const fresh = await prisma.user.findUnique({
        where: { id: token.id },
        include: { roles: true, tenant: { select: { id: true } } },
      });
      if (!fresh || passwordFingerprint(fresh.passwordHash) !== token.pwd) {
        return {} as JWT;
      }
      token.tenantId = fresh.tenant?.id ?? null;
      token.roles = toSessionRoles(fresh.roles);
      token.refreshedAt = Date.now();
      return token;
    },
    async session({ session, token }) {
      // Revoked token (see jwt callback) - report no session at all.
      if (!token.id) return null as unknown as Session;
      session.user.id = token.id;
      session.user.tenantId = token.tenantId;
      session.user.roles = token.roles;
      return session;
    },
  },
};
