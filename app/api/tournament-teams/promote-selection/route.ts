import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { promoteSelectedPlayersSchema } from "@/lib/validations";
import { refreshIdentityAlertsSafely } from "@/lib/identity-checks";
import { createPromotedLearner, findPromotedLearner, highestBib, loadAgeRules, overAgeReason } from "@/lib/learners";

export const dynamic = "force-dynamic";

/**
 * Primary ball games: the team that goes up to the next level is selected
 * player by player from the game's teams (e.g. the best players across a
 * zone's schools form the zone team). Creates that team in the matching
 * game at the next level - or adds to it if it's already there - with each
 * player carried as the same learner (photo, birth certificate number, one
 * bib). Players over the next level's age limit are left off. JS and Senior
 * School teams go up whole through /api/tournament-teams/promote.
 */
export async function POST(request: Request) {
  try {
    const input = promoteSelectedPlayersSchema.parse(await request.json());

    const originGame = await prisma.game.findUnique({ where: { id: input.gameId } });
    if (!originGame) return NextResponse.json({ error: "Game not found" }, { status: 404 });
    if (originGame.isTimed || !originGame.sport) {
      return NextResponse.json({ error: "Only ball-game team events can be promoted" }, { status: 400 });
    }
    if (originGame.schoolLevel !== "PRIMARY") {
      return NextResponse.json({ error: "JS and Senior School teams go up whole - use Promote top teams" }, { status: 400 });
    }

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

    // Only players on this game's team rosters can be picked.
    const picked = await prisma.participant.findMany({
      where: { id: { in: input.participantIds }, gameId: originGame.id, tournamentTeamId: { not: null } },
      include: { learner: true },
    });
    if (picked.length === 0) return NextResponse.json({ error: "None of those players are on this game's teams" }, { status: 400 });

    const ageRules = await loadAgeRules(prisma, input.targetChampionshipId);
    const maxAge = ageRules?.maxAgeFor(targetGame.schoolLevel) ?? null;
    const players = picked.filter(
      (p) => !(ageRules && overAgeReason(p, { schoolLevel: targetGame.schoolLevel, maxAge }, ageRules.ageDate)),
    );
    const overAge = picked.length - players.length;
    let nextBib = (await highestBib(prisma, input.targetChampionshipId)) + 1;
    // Learners registered here by promotion, checked against other records afterwards.
    const newLearnerIds: string[] = [];

    const result = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "tournament_teams",
      mutate: async (tx) => {
        const team =
          (await tx.tournamentTeam.findFirst({
            where: { championshipId: input.targetChampionshipId, gameId: targetGame.id, name: { equals: input.teamName, mode: "insensitive" } },
          })) ??
          (await tx.tournamentTeam.create({
            data: { championshipId: input.targetChampionshipId, gameId: targetGame.id, name: input.teamName, gender: originGame.gender },
          }));

        let added = 0;
        let alreadyIn = 0;
        for (const player of players) {
          let learner = player.learner ? await findPromotedLearner(tx, player.learner, input.targetChampionshipId) : null;
          if (learner && (await tx.participant.findFirst({ where: { gameId: targetGame.id, learnerId: learner.id }, select: { id: true } }))) {
            alreadyIn++;
            continue;
          }
          if (player.learner && !learner) {
            learner = await createPromotedLearner(tx, player.learner, input.targetChampionshipId, nextBib++);
            newLearnerIds.push(learner.id);
          }
          await tx.participant.create({
            data: {
              championshipId: input.targetChampionshipId,
              gameId: targetGame.id,
              tournamentTeamId: team.id,
              learnerId: learner?.id ?? null,
              firstName: player.firstName,
              lastName: player.lastName,
              gender: player.gender,
              dateOfBirth: player.dateOfBirth,
              bibNumber: learner ? learner.bibNumber : nextBib++,
              jerseyNumber: player.jerseyNumber,
              playingPosition: player.playingPosition,
            },
          });
          added++;
        }
        return { team, added, alreadyIn };
      },
      recordId: (r) => r.team.id,
      newData: { ...input, overAge },
    });

    await refreshIdentityAlertsSafely(prisma, newLearnerIds);
    return NextResponse.json({ team: result.team.name, added: result.added, alreadyIn: result.alreadyIn, overAge });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
