import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { getAuthContext, requireTeamAccess, isGeographicallyRestricted, assertWithinGeographicScope, toErrorResponse } from "@/lib/authorize";
import { tournamentTeamSchema, dashboardTournamentTeamSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const championshipId = searchParams.get("championshipId");
    const gameId = searchParams.get("gameId");
    if (!championshipId) return NextResponse.json({ error: "championshipId is required" }, { status: 400 });

    const where: Record<string, unknown> = { championshipId };
    if (gameId) where.gameId = gameId;

    const teams = await prisma.tournamentTeam.findMany({ where, orderBy: { name: "asc" } });
    return NextResponse.json({ teams });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * Open-tournament teams may self-register without authentication (they pay
 * their entry fee directly via /api/payments/initialize with mode
 * "team_fee") - no specific game is chosen in that flow. Tenant staff adding
 * teams from the dashboard must pick the game the team is registering for;
 * gender is derived from that game rather than asked separately.
 */
export async function POST(request: Request) {
  try {
    const rawBody: unknown = await request.json();
    const ctx = await getAuthContext();
    const input = ctx ? dashboardTournamentTeamSchema.parse(rawBody) : tournamentTeamSchema.parse(rawBody);

    const championship = await prisma.championship.findUnique({ where: { id: input.championshipId } });
    if (!championship) return NextResponse.json({ error: "Championship not found" }, { status: 404 });

    if (isGeographicallyRestricted(championship.level)) {
      assertWithinGeographicScope(championship.county, input.county);
    }

    let gender: "BOYS" | "GIRLS" | "MIXED" = "MIXED";
    if (input.gameId) {
      const game = await prisma.game.findUnique({ where: { id: input.gameId } });
      if (!game || game.championshipId !== input.championshipId) {
        return NextResponse.json({ error: "Game not found in this championship" }, { status: 404 });
      }
      gender = game.gender;
    }

    if (ctx) {
      await requireTeamAccess(input.championshipId, input.name);
    }
    // else: unauthenticated public self-registration (open-tournament teams paying their own entry fee)

    const duplicate = await prisma.tournamentTeam.findFirst({
      where: {
        championshipId: input.championshipId,
        gameId: input.gameId ?? null,
        name: { equals: input.name.trim(), mode: "insensitive" },
      },
    });
    if (duplicate) {
      return NextResponse.json({ error: "A team with this name is already registered for this game" }, { status: 409 });
    }

    const team = await withAudit({
      actorId: ctx?.userId ?? null,
      operation: "INSERT",
      tableName: "tournament_teams",
      mutate: (tx) =>
        tx.tournamentTeam.create({
          data: {
            championshipId: input.championshipId,
            gameId: input.gameId ?? null,
            name: input.name,
            teamCode: input.teamCode ?? null,
            gender,
            teamColor: input.teamColor ?? null,
            contactName: input.contactName ?? null,
            contactEmail: input.contactEmail ?? null,
            contactPhone: input.contactPhone ?? null,
            notes: input.notes ?? null,
            county: input.county ?? null,
          },
        }),
      recordId: (result) => result.id,
      newData: input,
    });

    return NextResponse.json({ team }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "That team code is already used in this championship" }, { status: 409 });
    }
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
