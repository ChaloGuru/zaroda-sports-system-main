import type { AuthContext } from "./authorize";
import { prisma } from "./prisma";

/**
 * Who the author is, in words a landing-page visitor understands - snapshotted
 * onto the testimonial when it's submitted (see the Testimonial model).
 */
export async function testimonialAuthor(ctx: AuthContext) {
  const [user, tenant] = await Promise.all([
    prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } }),
    ctx.tenantId
      ? prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { organizationName: true, accountType: true } })
      : null,
  ]);

  let authorRole = "Zaroda Sports user";
  if (tenant) {
    authorRole = tenant.accountType === "SCHOOL" ? "School championship organizer" : "Tournament organizer";
  } else {
    const scoped = ctx.roles.find((r) => r.championshipId !== null);
    if (scoped) {
      authorRole = scoped.role
        .split("_")
        .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
        .join(" ");
    }
  }

  return {
    authorName: user?.name?.trim() || "A Zaroda Sports user",
    authorRole,
    organizationName: tenant?.organizationName ?? null,
  };
}

/**
 * Number of championships each author's organization has actually run on the
 * platform - ties a testimonial's claims to something checkable, so one whose
 * wording implies heavy use from an account that's run nothing gets caught
 * before it's featured.
 */
export async function championshipsRunByTenant(tenantIds: Array<string | null>): Promise<Map<string, number>> {
  const ids = Array.from(new Set(tenantIds.filter((id): id is string => id !== null)));
  if (ids.length === 0) return new Map();
  const counts = await prisma.championship.groupBy({
    by: ["tenantId"],
    where: { tenantId: { in: ids } },
    _count: { tenantId: true },
  });
  return new Map(counts.map((c) => [c.tenantId, c._count.tenantId]));
}
