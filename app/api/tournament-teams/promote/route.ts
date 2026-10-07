import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { resolveTeamSchoolId } from "@/lib/championship-schools";
import {
  requireChampionshipAccess,
  isGeographicallyRestricted,
  assertWithinGeographicScope,
  toErrorResponse,
} from "@/lib/authorize";
import { promoteTeamsSchema } from "@/lib/validations";
import { refreshIdentityAlertsSafely } from "@/lib/identity-checks";
import { createPromotedLearner, findPromotedLearner, highestBib, loadAgeRules, overAgeReason } from "@/lib/learners";
import { computeSingleGameStandings } from "@/lib/team-standings";

export const dynamic = "force-dynamic";

/**
 * Carries a game's top-N teams forward into a higher-level championship's
 * matching game (same category/gender/schoolLevel/sport), which must already
 * exist there - level changes are a billing decision, so we never
 * auto-create a championship or game on someone's behalf.
 *
 * JS/Senior School/Tertiary teams go up whole and are renamed
 * "{Origin Championship Name} - {Team Name}" so their lineage is visible at
 * the new level. Primary teams don't go up whole: the next level's team is
 * picked player by player (see ./promote-selection).
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
    if (originGame.schoolLevel === "PRIMARY") {
      return NextResponse.json({ error: "Primary teams going up are picked player by player - use Pick the team to send up" }, { status: 400 });
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

    const newName = (originTeamName: string) => {
      const prefix = originGame.championship.name;
      if (originTeamName.toLowerCase().includes(prefix.toLowerCase())) return originTeamName;
      return `${prefix} - ${originTeamName}`;
    };

    let nextBibNumber: number | null = null;
    // Learners registered here by promotion, checked against other records afterwards.
    const newLearnerIds: string[] = [];
    let ageRules: Awaited<ReturnType<typeof loadAgeRules>> | undefined;

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

      const targetName = newName(originTeam.name);
      // A bare zone-name team (e.g. "OSOSGO ZONE" with no " - School" suffix)
      // already sitting in this game means someone added the zone itself as
      // an organization before any of its schools were promoted - creating
      // "OSOSGO ZONE - Oyani sch" alongside it would just look like a
      // duplicate on the public Teams/Schools page. Skip and let the admin
      // reconcile (rename or delete) the existing row manually instead.
      const zonePlaceholder = await prisma.tournamentTeam.findFirst({
        where: {
          championshipId: input.targetChampionshipId,
          gameId: targetGame.id,
          name: { equals: originGame.championship.name, mode: "insensitive" },
        },
      });
      if (zonePlaceholder && targetName !== originTeam.name) {
        promoted.push({ team: `${originTeam.name} (skipped - "${zonePlaceholder.name}" already exists in this game)`, created: false, rosterCopied: 0 });
        continue;
      }

      if (isGeographicallyRestricted(targetChampionship.level)) {
        assertWithinGeographicScope(targetChampionship.county, originTeam.county);
      }

      // Players over the next level's age limit are left off its roster.
      ageRules ??= await loadAgeRules(prisma, input.targetChampionshipId);
      const fullRoster = await prisma.participant.findMany({ where: { tournamentTeamId: originTeam.id }, include: { learner: true } });
      const roster = fullRoster.filter(
        (player) =>
          !(
            ageRules &&
            overAgeReason(player, { schoolLevel: targetGame.schoolLevel, maxAge: ageRules.maxAgeFor(targetGame.schoolLevel) }, ageRules.ageDate)
          ),
      );
      const overAge = fullRoster.length - roster.length;

      if (nextBibNumber === null) {
        nextBibNumber = (await highestBib(prisma, input.targetChampionshipId)) + 1;
      }

      const result = await withAudit({
        actorId: ctx.userId,
        operation: "INSERT",
        tableName: "tournament_teams",
        mutate: async (tx) => {
          // Linked when the promoted name matches a school on the target
          // championship's list (zone-prefixed JS names usually won't).
          const schoolId = await resolveTeamSchoolId(input.targetChampionshipId, targetName, targetGame.schoolLevel, tx);
          const newTeam = await tx.tournamentTeam.create({
            data: {
              championshipId: input.targetChampionshipId,
              gameId: targetGame.id,
              schoolId,
              name: targetName,
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
            // A school player stays the same learner (photo, birth certificate
            // number, one bib) at the next level.
            let learner = player.learner ? await findPromotedLearner(tx, player.learner, input.targetChampionshipId) : null;
            if (learner && (await tx.participant.findFirst({ where: { gameId: targetGame.id, learnerId: learner.id }, select: { id: true } }))) {
              continue;
            }
            if (player.learner && !learner) {
              learner = await createPromotedLearner(tx, player.learner, input.targetChampionshipId, (nextBibNumber as number)++);
              newLearnerIds.push(learner.id);
            }
            await tx.participant.create({
              data: {
                championshipId: input.targetChampionshipId,
                gameId: targetGame.id,
                tournamentTeamId: newTeam.id,
                learnerId: learner?.id ?? null,
                firstName: player.firstName,
                lastName: player.lastName,
                gender: player.gender,
                dateOfBirth: player.dateOfBirth,
                bibNumber: learner ? learner.bibNumber : (nextBibNumber as number)++,
                jerseyNumber: player.jerseyNumber,
                playingPosition: player.playingPosition,
              },
            });
          }

          return newTeam;
        },
        recordId: (team) => team.id,
        newData: { promotedFromTeamId: originTeam.id, targetChampionshipId: input.targetChampionshipId, rosterCopied: roster.length, overAge },
      });

      promoted.push({
        team: overAge > 0 ? `${result.name} (${overAge} player${overAge === 1 ? "" : "s"} over the age limit left off)` : result.name,
        created: true,
        rosterCopied: roster.length,
      });
    }

    await refreshIdentityAlertsSafely(prisma, newLearnerIds);
    return NextResponse.json({ promoted });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
