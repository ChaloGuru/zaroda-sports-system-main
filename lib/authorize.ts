import { getServerSession } from "next-auth";
import type { Level, Role } from "@prisma/client";
import { authOptions, type SessionRole } from "./auth";
import { prisma } from "./prisma";

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
 * Subscription gate (§4.2): BASE level is always free for a TENANT_OWNER.
 * ZONE and above require an ACTIVE, unexpired ChampionshipSubscription
 * covering this tenant + level.
 */
export async function requireActiveSubscriptionForLevel(tenantId: string, level: Level): Promise<void> {
  if (level === "BASE") return;

  const subscription = await prisma.championshipSubscription.findFirst({
    where: {
      tenantId,
      status: "ACTIVE",
      expiresAt: { gt: new Date() },
      plan: { level },
    },
  });

  if (!subscription) {
    throw new AuthorizationError(
      `Upgrade required: an active Essential subscription for the ${level} level is required to create or edit championships at this level.`,
      402,
    );
  }
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

/** Maps a thrown error (AuthorizationError or otherwise) to a JSON API response body + status. */
export function toErrorResponse(error: unknown): { body: { error: string }; status: number } {
  if (error instanceof AuthorizationError) {
    return { body: { error: error.message }, status: error.status };
  }
  if (error instanceof Error) {
    return { body: { error: error.message }, status: 400 };
  }
  return { body: { error: "Unexpected error" }, status: 500 };
}
