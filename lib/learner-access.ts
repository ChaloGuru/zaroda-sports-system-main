import type { Role } from "@prisma/client";
import { prisma } from "./prisma";
import { canViewChampionshipPrivateData, managedTeamSchoolIds, type AuthContext } from "./authorize";

/** Officials who check learners in - they can raise a challenge and confirm documents were seen. */
export const CALL_ROOM_ROLES: Role[] = [
  "TOURNAMENT_ADMIN",
  "SCOREKEEPER",
  "OFFICIAL",
  "CHIEF_CALLROOM_MANAGER",
  "CHIEF_TRACK_JUDGE",
  "CHIEF_FIELD_JUDGE",
  "CHIEF_RECORDER",
];

/** The championship's officials, or the manager of a team from the learner's school. */
export async function canViewLearner(
  ctx: AuthContext | null,
  learner: { schoolId: string | null; championship: { id: string; tenantId: string } },
): Promise<boolean> {
  if (await canViewChampionshipPrivateData(ctx, learner.championship)) return true;
  return !!ctx && !!learner.schoolId && (await managedTeamSchoolIds(ctx, learner.championship.id)).includes(learner.schoolId);
}

/**
 * An official comparing an identity alert's two records may see the other
 * record's photo and document, when it's from another championship of the
 * same organiser. Another organiser's learners stay private to them.
 */
export async function canViewLinkedLearner(ctx: AuthContext | null, learnerId: string): Promise<boolean> {
  if (!ctx) return false;
  const alerts = await prisma.learnerIdentityAlert.findMany({
    where: { OR: [{ learnerAId: learnerId }, { learnerBId: learnerId }] },
    select: {
      learnerAId: true,
      learnerA: { select: { championship: { select: { id: true, tenantId: true } } } },
      learnerB: { select: { championship: { select: { id: true, tenantId: true } } } },
    },
  });
  for (const alert of alerts) {
    const [mine, other] = alert.learnerAId === learnerId ? [alert.learnerA, alert.learnerB] : [alert.learnerB, alert.learnerA];
    if (mine.championship.tenantId !== other.championship.tenantId) continue;
    if (await canViewChampionshipPrivateData(ctx, other.championship)) return true;
  }
  return false;
}

/** The signed-in user's name, for "checked by" and "raised by" lines. */
export async function actorName(ctx: AuthContext): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } });
  return user?.name ?? ctx.email;
}
