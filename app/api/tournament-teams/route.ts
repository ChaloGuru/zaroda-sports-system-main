import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { getAuthContext, requireAuth, canViewChampionshipPrivateData, managesTeam, requireTeamAccess, isGeographicallyRestricted, assertWithinGeographicScope, toErrorResponse } from "@/lib/authorize";
import { dashboardTournamentTeamSchema } from "@/lib/validations";
import { resolveTeamSchoolId } from "@/lib/championship-schools";
import type { SchoolLevel } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const championshipId = searchParams.get("championshipId");
    const gameId = searchParams.get("gameId");
    if (!championshipId) return NextResponse.json({ error: "championshipId is required" }, { status: 400 });

    const championship = await prisma.championship.findUnique({
      where: { id: championshipId },
      select: { id: true, tenantId: true, isPublished: true },
    });
    if (!championship) return NextResponse.json({ teams: [] });

    const ctx = await getAuthContext();
    const isStaff = await canViewChampionshipPrivateData(ctx, championship);

    const where: Record<string, unknown> = { championshipId };
    if (gameId) where.gameId = gameId;
    const all = await prisma.tournamentTeam.findMany({ where, orderBy: { name: "asc" } });

    // A team manager sees their own team(s) in full, published or not; other
    // teams only as the public does. Contact details and notes are for
    // officials and the team's own manager.
    const own = new Set<string>();
    if (!isStaff && ctx) {
      for (const team of all) if (await managesTeam(ctx, championshipId, team.name)) own.add(team.id);
    }
    const visible = isStaff || championship.isPublished ? all : all.filter((team) => own.has(team.id));
    return NextResponse.json({
      teams: visible.map((team) => {
        if (isStaff || own.has(team.id)) return team;
        const { contactName: _n, contactEmail: _e, contactPhone: _p, notes: _notes, ...rest } = team;
        return rest;
      }),
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * Staff-only. Open-tournament teams self-register through
 * /api/payments/initialize (mode "team_fee"), which creates the team as part
 * of starting its entry-fee payment - never through this route. Tenant staff
 * adding teams from the dashboard must pick the game the team is registering
 * for; gender is derived from that game rather than asked separately.
 */
export async function POST(request: Request) {
  try {
    const rawBody: unknown = await request.json();
    const ctx = await requireAuth();
    const input = dashboardTournamentTeamSchema.parse(rawBody);

    const championship = await prisma.championship.findUnique({ where: { id: input.championshipId } });
    if (!championship) return NextResponse.json({ error: "Championship not found" }, { status: 404 });

    if (isGeographicallyRestricted(championship.level)) {
      assertWithinGeographicScope(championship.county, input.county);
    }

    let gender: "BOYS" | "GIRLS" | "MIXED" = "MIXED";
    let gameSchoolLevel: SchoolLevel | null = null;
    if (input.gameId) {
      const game = await prisma.game.findUnique({ where: { id: input.gameId } });
      if (!game || game.championshipId !== input.championshipId) {
        return NextResponse.json({ error: "Game not found in this championship" }, { status: 404 });
      }
      gender = game.gender;
      gameSchoolLevel = game.schoolLevel;
    }
    // Link the team to the school it's named after, so renaming the school
    // renames the team too.
    const schoolId = await resolveTeamSchoolId(input.championshipId, input.name, gameSchoolLevel);

    await requireTeamAccess(input.championshipId, input.name);

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
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "tournament_teams",
      mutate: (tx) =>
        tx.tournamentTeam.create({
          data: {
            championshipId: input.championshipId,
            gameId: input.gameId ?? null,
            schoolId,
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
