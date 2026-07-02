import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { bulkTournamentTeamsSchema } from "@/lib/validations";

/**
 * Registers each given organization/school name as a team in every game the
 * championship already has, so a tenant only has to type each school's name
 * once instead of recreating "Manyonge Primary" by hand for every one of
 * (say) 16 standard events. Skips (name, gameId) pairs that already exist so
 * this is safe to re-run after adding more organizations later.
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const input = bulkTournamentTeamsSchema.parse(body);

    const ctx = await requireChampionshipAccess(input.championshipId, ["TOURNAMENT_ADMIN"]);

    const games = await prisma.game.findMany({ where: { championshipId: input.championshipId } });
    if (games.length === 0) {
      return NextResponse.json({ error: "Add at least one game before bulk-adding teams" }, { status: 400 });
    }

    const existing = await prisma.tournamentTeam.findMany({
      where: { championshipId: input.championshipId, gameId: { in: games.map((g) => g.id) } },
      select: { name: true, gameId: true },
    });
    const existingKeys = new Set(existing.map((t) => `${t.name.trim().toLowerCase()}::${t.gameId}`));

    const organizationNames = Array.from(new Set(input.organizationNames.map((n) => n.trim()).filter(Boolean)));

    const rowsToCreate = organizationNames.flatMap((name) =>
      games
        .filter((game) => !existingKeys.has(`${name.toLowerCase()}::${game.id}`))
        .map((game) => ({
          championshipId: input.championshipId,
          gameId: game.id,
          name,
          gender: game.gender,
        })),
    );

    if (rowsToCreate.length === 0) {
      return NextResponse.json({ created: 0, skipped: organizationNames.length * games.length });
    }

    const result = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "tournament_teams",
      mutate: (tx) => tx.tournamentTeam.createMany({ data: rowsToCreate }),
      recordId: () => input.championshipId,
      newData: { organizationNames, gamesCount: games.length, createdCount: rowsToCreate.length },
    });

    return NextResponse.json({
      created: result.count,
      skipped: organizationNames.length * games.length - rowsToCreate.length,
      organizations: organizationNames.length,
      games: games.length,
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
