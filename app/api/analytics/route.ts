import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isSuperAdmin, hasRole, CHAMPIONSHIP_OPERATIONAL_ROLES, toErrorResponse } from "@/lib/authorize";

export const dynamic = "force-dynamic";

/**
 * Financial/registration figures here aren't public data (unlike /api/rankings),
 * so this always requires the same admin/operational access as the dashboard
 * championship detail page - no isPublished bypass.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const championshipId = searchParams.get("championshipId");
    if (!championshipId) return NextResponse.json({ error: "championshipId is required" }, { status: 400 });

    const ctx = await getAuthContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const championship = await prisma.championship.findUnique({ where: { id: championshipId } });
    if (!championship) return NextResponse.json({ error: "Championship not found" }, { status: 404 });

    const isFullAdmin = isSuperAdmin(ctx) || (hasRole(ctx, "TENANT_OWNER") && ctx.tenantId === championship.tenantId);
    const hasOperationalRole = ctx.roles.some(
      (r) => r.championshipId === championshipId && CHAMPIONSHIP_OPERATIONAL_ROLES.includes(r.role),
    );
    if (!isFullAdmin && !hasOperationalRole) return NextResponse.json({ error: "Championship not found" }, { status: 404 });

    const [games, participants, teams, payments] = await Promise.all([
      prisma.game.findMany({ where: { championshipId }, select: { id: true, category: true, gender: true, schoolLevel: true } }),
      prisma.participant.findMany({
        where: { championshipId },
        select: { gameId: true, gender: true, status: true, isQualified: true, position: true },
      }),
      prisma.tournamentTeam.findMany({ where: { championshipId }, select: { id: true, gender: true, county: true } }),
      prisma.teamFeePayment.findMany({ where: { championshipId }, select: { amountKes: true, status: true } }),
    ]);

    const gamesByCategory = tallyBy(games, (g) => g.category);
    const gamesByGender = tallyBy(games, (g) => g.gender);
    const gamesWithResults = new Set(participants.filter((p) => p.position !== null).map((p) => p.gameId));

    const participantsByGender = tallyBy(participants, (p) => p.gender);
    const participantsByStatus = tallyBy(participants, (p) => p.status);
    const qualifiedCount = participants.filter((p) => p.isQualified).length;

    const teamsByGender = tallyBy(teams, (t) => t.gender);
    const teamsByCounty = tallyBy(teams, (t) => t.county ?? "Unknown");

    const paymentsByStatus = tallyBy(payments, (p) => p.status);
    const revenueCollected = payments.filter((p) => p.status === "PAID").reduce((sum, p) => sum + p.amountKes, 0);
    const revenuePending = payments.filter((p) => p.status === "PENDING").reduce((sum, p) => sum + p.amountKes, 0);
    const revenueFailed = payments.filter((p) => p.status === "FAILED").reduce((sum, p) => sum + p.amountKes, 0);

    return NextResponse.json({
      totals: {
        games: games.length,
        participants: participants.length,
        teams: teams.length,
        qualified: qualifiedCount,
      },
      games: { byCategory: gamesByCategory, byGender: gamesByGender, withResultsCount: gamesWithResults.size },
      participants: { byGender: participantsByGender, byStatus: participantsByStatus },
      teams: { byGender: teamsByGender, byCounty: teamsByCounty },
      revenue: {
        collectedKes: revenueCollected,
        pendingKes: revenuePending,
        failedKes: revenueFailed,
        byStatus: paymentsByStatus,
      },
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

function tallyBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}
