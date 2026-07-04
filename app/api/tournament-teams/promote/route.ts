import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import {
  requireChampionshipAccess,
  isGeographicallyRestricted,
  assertWithinGeographicScope,
  toErrorResponse,
} from "@/lib/authorize";
import { promoteTeamsSchema } from "@/lib/validations";
import { computeSingleGameStandings } from "@/lib/team-standings";

export const dynamic = "force-dynamic";

/**
 * Carries a game's top-N teams forward into a higher-level championship's
 * matching game (same category/gender/schoolLevel/sport), which must already
 * exist there - level changes are a billing decision, so we never
 * auto-create a championship or game on someone's behalf.
 *
 * Naming rule: JS/Senior School/Tertiary teams are renamed
 * "{Origin Championship Name} - {Team Name}" so their lineage is visible at
 * the new level; Primary teams keep just their own organization name.
 *
 * The roster is copied as an editable starting point (not a permanent link)
 * since squads can change between levels.
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const input = promoteTeamsSchema.parse(body);

    const originGame = await prisma.game.findUnique({
      where: { id: input.gameId },
      include: { championship: { select: { id: true, name: true } } },
    });
    if (!originGame) return NextResponse.json({ error: "Game not found" }, { status: 404 });
    if (originGame.isTimed || !originGame.sport) {
      return NextResponse.json({ error: "Only ball-game team events can be promoted" }, { status: 400 });
    }

    const targetChampionship = await prisma.championship.findUnique({ where: { id: input.targetChampionshipId } });
    if (!targetChampionship) return NextResponse.json({ error: "Target championship not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(originGame.championshipId, ["TOURNAMENT_ADMIN"]);
    await requireChampionshipAccess(input.targetChampionshipId, ["TOURNAMENT_ADMIN"]);

    const targetGame = await prisma.game.findFirst({
      where: {
        championshipId: input.targetChampionshipId,
        category: originGame.category,
        gender: originGame.gender,
        schoolLevel: originGame.schoolLevel,
        sport: originGame.sport,
      },
    });
    if (!targetGame) {
      return NextResponse.json(
        { error: `No matching "${originGame.name}"-type game exists yet in the target championship - create it there first.` },
        { status: 400 },
      );
    }

    const standings = await computeSingleGameStandings(input.gameId);
    if (!standings || standings.length === 0) {
      return NextResponse.json({ error: "This game has no standings yet to promote from" }, { status: 400 });
    }
    const promotees = standings.slice(0, input.topN);

    const newName = (originTeamName: string) =>
      originGame.schoolLevel === "PRIMARY" ? originTeamName : `${originGame.championship.name} - ${originTeamName}`;

    let nextBibNumber: number | null = null;

    const promoted: Array<{ team: string; created: boolean; rosterCopied: number }> = [];

    for (const row of promotees) {
      const originTeam = await prisma.tournamentTeam.findUnique({ where: { id: row.teamId } });
      if (!originTeam) continue;

      const already = await prisma.tournamentTeam.findFirst({
        where: { championshipId: input.targetChampionshipId, promotedFromTeamId: originTeam.id },
      });
      if (already) {
        promoted.push({ team: already.name, created: false, rosterCopied: 0 });
        continue;
      }

      if (isGeographicallyRestricted(targetChampionship.level)) {
        assertWithinGeographicScope(targetChampionship.county, originTeam.county);
      }

      const roster = await prisma.participant.findMany({ where: { tournamentTeamId: originTeam.id } });

      if (nextBibNumber === null) {
        const highest = await prisma.participant.findFirst({
          where: { championshipId: input.targetChampionshipId },
          orderBy: { bibNumber: "desc" },
          select: { bibNumber: true },
        });
        nextBibNumber = (highest?.bibNumber ?? 0) + 1;
      }

      const result = await withAudit({
        actorId: ctx.userId,
        operation: "INSERT",
        tableName: "tournament_teams",
        mutate: async (tx) => {
          const newTeam = await tx.tournamentTeam.create({
            data: {
              championshipId: input.targetChampionshipId,
              gameId: targetGame.id,
              name: newName(originTeam.name),
              gender: originTeam.gender,
              teamColor: originTeam.teamColor,
              contactName: originTeam.contactName,
              contactEmail: originTeam.contactEmail,
              contactPhone: originTeam.contactPhone,
              county: originTeam.county,
              promotedFromTeamId: originTeam.id,
            },
          });

          for (const player of roster) {
            await tx.participant.create({
              data: {
                championshipId: input.targetChampionshipId,
                gameId: targetGame.id,
                tournamentTeamId: newTeam.id,
                firstName: player.firstName,
                lastName: player.lastName,
                gender: player.gender,
                bibNumber: (nextBibNumber as number)++,
                jerseyNumber: player.jerseyNumber,
                playingPosition: player.playingPosition,
              },
            });
          }

          return newTeam;
        },
        recordId: (team) => team.id,
        newData: { promotedFromTeamId: originTeam.id, targetChampionshipId: input.targetChampionshipId, rosterCopied: roster.length },
      });

      promoted.push({ team: result.name, created: true, rosterCopied: roster.length });
    }

    return NextResponse.json({ promoted });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
