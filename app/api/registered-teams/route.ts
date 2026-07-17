import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";

export const dynamic = "force-dynamic";

/**
 * Teams that have registered and paid (TeamFeePayment.status: PAID) for a
 * given championship - primarily for open-tournament managers to see who's
 * actually confirmed, since payment there settles straight to their own
 * payout account rather than through any Zaroda-managed record.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const championshipId = searchParams.get("championshipId");
    if (!championshipId) return NextResponse.json({ error: "championshipId is required" }, { status: 400 });

    await requireChampionshipAccess(championshipId);

    const teams = await prisma.tournamentTeam.findMany({
      where: { championshipId, feePayments: { some: { status: "PAID" } } },
      include: {
        feePayments: { where: { status: "PAID" }, include: { fee: { select: { name: true } } } },
        game: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ teams });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
