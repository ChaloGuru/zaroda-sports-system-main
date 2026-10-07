import { getServerSession } from "next-auth";
import { Prisma, type Level, type Role } from "@prisma/client";
import { ZodError } from "zod";
import { authOptions, type SessionRole } from "./auth";
import { prisma } from "./prisma";
import { LEVEL_LABELS } from "./utils";
import { roleMatchesGameScope } from "./role-scope";

export class AuthorizationError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.name = "AuthorizationError";
    this.status = status;
  }
}

export interface AuthContext {
  userId: string;
  email: string;
  tenantId: string | null;
  roles: SessionRole[];
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return {
    userId: session.user.id,
    email: session.user.email,
    tenantId: session.user.tenantId,
    roles: session.user.roles,
  };
}

export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthorizationError("Authentication required", 401);
  return ctx;
}

export function hasRole(ctx: AuthContext, role: Role): boolean {
  return ctx.roles.some((r) => r.role === role);
}

export function isSuperAdmin(ctx: AuthContext): boolean {
  return hasRole(ctx, "SUPER_ADMIN");
}

/** Throws unless the caller is SUPER_ADMIN or holds one of `roles` globally. */
export async function requireRole(roles: Role[]): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (isSuperAdmin(ctx)) return ctx;
  const allowed = ctx.roles.some((r) => roles.includes(r.role));
  if (!allowed) throw new AuthorizationError(`Requires one of roles: ${roles.join(", ")}`);
  return ctx;
}

/** Throws unless the caller owns `tenantId` (or is SUPER_ADMIN). */
export async function requireTenantAccess(tenantId: string): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (isSuperAdmin(ctx)) return ctx;
  if (!hasRole(ctx, "TENANT_OWNER") || ctx.tenantId !== tenantId) {
    throw new AuthorizationError("You do not have access to this tenant's data");
  }
  return ctx;
}

/**
 * All non-owner, championship-scoped roles that can legitimately reach a
 * championship's dashboard page in some capacity. Kept as one list so page
 * guards (e.g. app/dashboard/championships/[id]/page.tsx) can't silently
 * fall out of sync with new roles added to requireChampionshipAccess/
 * requireTeamAccess - each new operational role must be added here too.
 */
export const CHAMPIONSHIP_OPERATIONAL_ROLES: Role[] = [
  "TOURNAMENT_ADMIN",
  "SCOREKEEPER",
  "OFFICIAL",
  "GAME_COORDINATOR",
  "CHIEF_CALLROOM_MANAGER",
  "CHIEF_TRACK_JUDGE",
  "CHIEF_FIELD_JUDGE",
  "CHIEF_RECORDER",
  "TEAM_MANAGER",
];

/**
 * True if the caller may see a championship's private data - participants'
 * dates of birth and notes, team contact details, learners' photos and
 * birth certificate numbers - rather than just the public results view:
 * SUPER_ADMIN, the owning TENANT_OWNER, or an official holding an
 * operational role scoped to this championship that hasn't expired. Team
 * managers aren't officials here: they see only their own team(s)
 * (managesTeam) and their own school's learners (managedTeamSchoolIds).
 */
export async function canViewChampionshipPrivateData(
  ctx: AuthContext | null,
  championship: { id: string; tenantId: string },
): Promise<boolean> {
  if (!ctx) return false;
  if (isSuperAdmin(ctx)) return true;
  if (hasRole(ctx, "TENANT_OWNER") && ctx.tenantId === championship.tenantId) return true;
  const official = ctx.roles.some(
    (r) => r.championshipId === championship.id && r.role !== "TEAM_MANAGER" && CHAMPIONSHIP_OPERATIONAL_ROLES.includes(r.role),
  );
  return official && (await isChampionshipRoleActive(championship.id));
}

/**
 * True if the caller may see a championship at all: it's published, or
 * they run it or hold any active role in it (team managers included -
 * they need its events and fixtures before it's published).
 */
export async function canSeeChampionship(
  ctx: AuthContext | null,
  championship: { id: string; tenantId: string; isPublished: boolean },
): Promise<boolean> {
  if (championship.isPublished) return true;
  if (!ctx) return false;
  if (isSuperAdmin(ctx)) return true;
  if (hasRole(ctx, "TENANT_OWNER") && ctx.tenantId === championship.tenantId) return true;
  const scoped = ctx.roles.some((r) => r.championshipId === championship.id && CHAMPIONSHIP_OPERATIONAL_ROLES.includes(r.role));
  return scoped && (await isChampionshipRoleActive(championship.id));
}

/** canSeeChampionship for a championship by id - false if it doesn't exist. */
export async function canSeeChampionshipById(championshipId: string): Promise<boolean> {
  const championship = await prisma.championship.findUnique({
    where: { id: championshipId },
    select: { id: true, tenantId: true, isPublished: true },
  });
  return !!championship && (await canSeeChampionship(await getAuthContext(), championship));
}

/** canSeeChampionship for the championship a game belongs to - false if the game doesn't exist. */
export async function canSeeGame(gameId: string): Promise<boolean> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { championship: { select: { id: true, tenantId: true, isPublished: true } } },
  });
  return !!game && (await canSeeChampionship(await getAuthContext(), game.championship));
}

/** True if the caller is the (active) team manager of the team named `teamName` in this championship. */
export async function managesTeam(ctx: AuthContext | null, championshipId: string, teamName: string): Promise<boolean> {
  if (!ctx) return false;
  const name = teamName.trim().toLowerCase();
  const role = ctx.roles.some(
    (r) => r.championshipId === championshipId && r.role === "TEAM_MANAGER" && r.organizationName?.trim().toLowerCase() === name,
  );
  return role && (await isChampionshipRoleActive(championshipId));
}

/** Championship-scoped roles expire once the event ends, with a one-day grace period. */
async function isChampionshipRoleActive(championshipId: string): Promise<boolean> {
  const championship = await prisma.championship.findUnique({
    where: { id: championshipId },
    select: { endDate: true },
  });
  if (!championship) return false;
  const expiresAt = new Date(championship.endDate);
  expiresAt.setDate(expiresAt.getDate() + 1);
  return new Date() < expiresAt;
}

/**
 * Throws unless the caller is SUPER_ADMIN, the TENANT_OWNER of the
 * championship's tenant, or holds one of `roles` scoped to this championship
 * via UserRole.championshipId. This is the primary check for
 * TOURNAMENT_ADMIN/SCOREKEEPER/OFFICIAL-level writes (§4.3).
 *
 * Championship-scoped roles expire once the championship ends (with a
 * one-day grace period so officials can still submit results on the final
 * day) - they aren't standing access, just for the duration of the event.
 */
export async function requireChampionshipAccess(
  championshipId: string,
  roles: Role[] = ["TOURNAMENT_ADMIN", "SCOREKEEPER", "OFFICIAL"],
): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (isSuperAdmin(ctx)) return ctx;

  const scopedRole = ctx.roles.find((r) => r.championshipId === championshipId && roles.includes(r.role));
  if (scopedRole && (await isChampionshipRoleActive(championshipId))) return ctx;

  if (hasRole(ctx, "TENANT_OWNER") && ctx.tenantId) {
    const championship = await prisma.championship.findUnique({
      where: { id: championshipId },
      select: { tenantId: true },
    });
    if (championship?.tenantId === ctx.tenantId) return ctx;
  }

  throw new AuthorizationError(
    scopedRole
      ? "Your role for this championship has expired now that the championship has ended"
      : "You do not have access to this championship",
  );
}

/**
 * Throws unless the caller is SUPER_ADMIN, the TENANT_OWNER of the game's
 * championship's tenant, or holds one of `roles` scoped to this championship
 * (and, if the role has sport/discipline scoping set, matching this game's
 * category/sport/track-or-field). Use this instead of
 * requireChampionshipAccess whenever the write targets a specific Game (or a
 * row that belongs to one), so e.g. a GAME_COORDINATOR scoped to Football
 * can't touch a basketball fixture, and a CHIEF_TRACK_JUDGE scoped to Track
 * can't touch a field event.
 */
export async function requireGameAccess(gameId: string, roles: Role[]): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (isSuperAdmin(ctx)) return ctx;

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { championshipId: true, category: true, sport: true, isTimed: true },
  });
  if (!game) throw new AuthorizationError("Game not found", 404);

  const scopedRole = ctx.roles.find(
    (r) => r.championshipId === game.championshipId && roles.includes(r.role) && roleMatchesGameScope(r, game),
  );
  if (scopedRole && (await isChampionshipRoleActive(game.championshipId))) return ctx;

  if (hasRole(ctx, "TENANT_OWNER") && ctx.tenantId) {
    const championship = await prisma.championship.findUnique({
      where: { id: game.championshipId },
      select: { tenantId: true },
    });
    if (championship?.tenantId === ctx.tenantId) return ctx;
  }

  throw new AuthorizationError(
    scopedRole
      ? "Your role for this championship has expired now that the championship has ended"
      : "You do not have access to this game",
  );
}

/**
 * Throws unless the caller can manage the given team: SUPER_ADMIN, the
 * TENANT_OWNER of the championship's tenant, a championship-scoped
 * TOURNAMENT_ADMIN, or a TEAM_MANAGER whose UserRole.organizationName
 * matches this team's name (case/whitespace-insensitive). Team managers
 * only ever get to add/edit/delete their own organization's team rows -
 * never anyone else's, and never anything outside the Teams surface.
 */
export async function requireTeamAccess(championshipId: string, teamName: string): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (isSuperAdmin(ctx)) return ctx;

  const normalizedTeamName = teamName.trim().toLowerCase();

  const scopedRole = ctx.roles.find(
    (r) =>
      r.championshipId === championshipId &&
      (r.role === "TOURNAMENT_ADMIN" ||
        (r.role === "TEAM_MANAGER" && r.organizationName?.trim().toLowerCase() === normalizedTeamName)),
  );
  if (scopedRole && (await isChampionshipRoleActive(championshipId))) return ctx;

  if (hasRole(ctx, "TENANT_OWNER") && ctx.tenantId) {
    const championship = await prisma.championship.findUnique({
      where: { id: championshipId },
      select: { tenantId: true },
    });
    if (championship?.tenantId === ctx.tenantId) return ctx;
  }

  throw new AuthorizationError("You do not have access to manage this team");
}

/**
 * The schools whose teams this user manages in a championship (TEAM_MANAGER
 * roles name the team) - so a school team's manager can see and register
 * that school's learners for their roster.
 */
export async function managedTeamSchoolIds(ctx: AuthContext, championshipId: string): Promise<string[]> {
  const teamNames = ctx.roles
    .filter((r) => r.championshipId === championshipId && r.role === "TEAM_MANAGER" && r.organizationName)
    .map((r) => r.organizationName!.trim());
  if (teamNames.length === 0 || !(await isChampionshipRoleActive(championshipId))) return [];
  const teams = await prisma.tournamentTeam.findMany({
    where: { championshipId, schoolId: { not: null }, OR: teamNames.map((name) => ({ name: { equals: name, mode: "insensitive" as const } })) },
    select: { schoolId: true },
  });
  return Array.from(new Set(teams.map((t) => t.schoolId as string)));
}

/**
 * Subscription gate: BASE level is free. Every championship at ZONE and
 * above needs its own paid subscription for that level - one not yet used
 * for another championship. Returns it so creating the championship can
 * claim it (ChampionshipSubscription.championshipId), so one payment covers
 * exactly one championship.
 */
export async function requireUnusedSubscriptionForLevel(tenantId: string, level: Level): Promise<{ id: string } | null> {
  if (level === "BASE") return null;

  const subscription = await prisma.championshipSubscription.findFirst({
    where: {
      tenantId,
      status: "ACTIVE",
      championshipId: null,
      plan: { level },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { paidAt: "asc" },
    select: { id: true },
  });

  if (!subscription) {
    throw new AuthorizationError(
      `Pay for a ${LEVEL_LABELS[level]} championship first - each subscription covers one championship at its level.`,
      402,
    );
  }
  return subscription;
}

/**
 * Anti-abuse for the free BASE tier (and the ZONE/SUB_COUNTY/COUNTY paid
 * tiers below REGIONAL/NATIONAL): a tenant could otherwise create a
 * BASE-level championship for free and register schools/teams from anywhere
 * in the country, getting national-scale reach without ever paying for a
 * higher level. Since Championship only records a single `county` (no
 * zone/sub-county/region breakdown), the enforceable rule with today's data
 * is: BASE/ZONE/SUB_COUNTY/COUNTY-level championships may only register
 * schools/teams whose own (self-reported) county matches the championship's
 * county. REGIONAL and NATIONAL are unrestricted.
 */
const GEOGRAPHICALLY_RESTRICTED_LEVELS: Level[] = ["BASE", "ZONE", "SUB_COUNTY", "COUNTY"];

export function isGeographicallyRestricted(level: Level): boolean {
  return GEOGRAPHICALLY_RESTRICTED_LEVELS.includes(level);
}

/** Throws unless `entityCounty` matches the championship's county (case/whitespace-insensitive). */
export function assertWithinGeographicScope(championshipCounty: string, entityCounty: string | null | undefined): void {
  if (!entityCounty || !entityCounty.trim()) {
    throw new AuthorizationError(
      "A county is required to register into this championship - please set the school/team's county.",
      400,
    );
  }
  if (entityCounty.trim().toLowerCase() !== championshipCounty.trim().toLowerCase()) {
    throw new AuthorizationError(
      `This championship is scoped to ${championshipCounty} County. Registering an institution from another county requires upgrading the championship to REGIONAL or NATIONAL level.`,
      403,
    );
  }
}

/**
 * Maps a thrown error to a JSON API response body + status. Messages from
 * AuthorizationError and the app's own `throw new Error("...")` checks are
 * written for users and passed through; validation errors are summarized;
 * database/driver errors never reach the client (they're logged instead),
 * since their messages expose table names, queries and internals.
 */
export function toErrorResponse(error: unknown): { body: { error: string }; status: number } {
  if (error instanceof AuthorizationError) {
    return { body: { error: error.message }, status: error.status };
  }
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const field = issue?.path.join(".");
    return { body: { error: issue ? (field ? `${field}: ${issue.message}` : issue.message) : "Invalid request" }, status: 400 };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return { body: { error: "A record with these details already exists" }, status: 409 };
    if (error.code === "P2025") return { body: { error: "Record not found" }, status: 404 };
    if (error.code === "P2003") return { body: { error: "This record is still referenced by other data" }, status: 409 };
    console.error("Unhandled database error:", error);
    return { body: { error: "Something went wrong. Please try again." }, status: 500 };
  }
  if (
    error instanceof Prisma.PrismaClientValidationError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    console.error("Database error:", error);
    return { body: { error: "Something went wrong. Please try again." }, status: 500 };
  }
  if (error instanceof SyntaxError) {
    return { body: { error: "Malformed request body" }, status: 400 };
  }
  if (error instanceof Error) {
    return { body: { error: error.message }, status: 400 };
  }
  return { body: { error: "Unexpected error" }, status: 500 };
}
