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

/** Consecutive failed sign-ins on one account before it is temporarily locked. */
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MS = 15 * 60_000;
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
function passwordFingerprint(passwordHash: string): string {
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
        if (!rateLimit(`login:${ip}`, IP_LOGIN_LIMIT, IP_LOGIN_WINDOW_MS).allowed) {
          throw new Error("Too many sign-in attempts. Please wait a few minutes and try again.");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
          include: { roles: true, tenant: true },
        });
        if (!user) {
          await bcrypt.compare(credentials.password, DUMMY_PASSWORD_HASH);
          return null;
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          throw new Error("This account is temporarily locked after too many failed sign-ins. Please try again in 15 minutes.");
        }

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) {
          // Atomic increment so concurrent guesses can't slip past the limit.
          const { failedLoginAttempts } = await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: { increment: 1 } },
            select: { failedLoginAttempts: true },
          });
          if (failedLoginAttempts >= MAX_FAILED_LOGINS) {
            await prisma.user.update({
              where: { id: user.id },
              data: { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MS) },
            });
          }
          return null;
        }

        if (user.failedLoginAttempts > 0 || user.lockedUntil) {
          await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
        }

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
