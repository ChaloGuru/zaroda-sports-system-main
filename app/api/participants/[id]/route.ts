import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, requireGameAccess, requireTeamAccess, toErrorResponse } from "@/lib/authorize";
import { participantStatusSchema, timeInputSchema, genderSchema } from "@/lib/validations";
import { parseTimeToSeconds } from "@/lib/scoring";
import { bibConflict, updateLearner, type LearnerChanges } from "@/lib/learners";

export const dynamic = "force-dynamic";

const participantUpdateSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  gender: genderSchema.optional(),
  bibNumber: z.number().int().positive().optional(),
  status: participantStatusSchema.optional(),
  timeInput: timeInputSchema.optional(),
  score: z.number().optional(),
  position: z.number().int().positive().nullable().optional(),
  laneNumber: z.number().int().positive().nullable().optional(),
  isQualified: z.boolean().optional(),
  notes: z.string().max(1000).nullable().optional(),
  jerseyNumber: z.number().int().positive().nullable().optional(),
  playingPosition: z.string().max(50).nullable().optional(),
});

/** Fields only officials may set - not team managers editing their roster. */
const RESULT_FIELDS = ["status", "timeInput", "score", "position", "laneNumber", "isQualified"] as const;

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const existing = await prisma.participant.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Participant not found" }, { status: 404 });

    let ctx;
    let teamAccessOnly = false;
    try {
      ctx = await requireGameAccess(existing.gameId, [
        "TOURNAMENT_ADMIN",
        "SCOREKEEPER",
        "OFFICIAL",
        "CHIEF_CALLROOM_MANAGER",
        "CHIEF_TRACK_JUDGE",
        "CHIEF_FIELD_JUDGE",
        "CHIEF_RECORDER",
      ]);
    } catch (accessError) {
      if (!existing.tournamentTeamId) throw accessError;
      const team = await prisma.tournamentTeam.findUnique({
        where: { id: existing.tournamentTeamId },
        select: { name: true },
      });
      if (!team) throw accessError;
      ctx = await requireTeamAccess(existing.championshipId, team.name);
      teamAccessOnly = true;
    }

    const body: unknown = await request.json();
    const input = participantUpdateSchema.parse(body);

    // Team managers maintain their own roster, never results - otherwise they
    // could place or qualify their own athletes.
    if (teamAccessOnly) {
      const resultField = RESULT_FIELDS.find((field) => input[field] !== undefined);
      if (resultField) {
        return NextResponse.json({ error: "Only officials can enter results or change an athlete's status" }, { status: 403 });
      }
    }

    const data: Record<string, unknown> = {};
    // A learner's name, gender and bib are theirs, not this entry's - change
    // them on the learner so every event they're entered in follows.
    const learnerChanges: LearnerChanges = {};
    const identity = existing.learnerId ? learnerChanges : data;
    if (input.firstName !== undefined) identity.firstName = input.firstName;
    if (input.lastName !== undefined) identity.lastName = input.lastName;
    if (input.gender !== undefined) identity.gender = input.gender;
    if (input.bibNumber !== undefined) identity.bibNumber = input.bibNumber;
    if (!existing.learnerId && input.bibNumber !== undefined && input.bibNumber !== existing.bibNumber) {
      const conflict = await bibConflict(prisma, existing.championshipId, input.bibNumber, null);
      if (conflict) throw new Error(conflict);
    }
    if (input.status !== undefined) data.status = input.status;
    if (input.timeInput !== undefined) data.timeTaken = parseTimeToSeconds(input.timeInput);
    if (input.score !== undefined) data.score = input.score;
    if (input.position !== undefined) data.position = input.position;
    if (input.laneNumber !== undefined) data.laneNumber = input.laneNumber;
    if (input.isQualified !== undefined) data.isQualified = input.isQualified;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.jerseyNumber !== undefined) data.jerseyNumber = input.jerseyNumber;
    if (input.playingPosition !== undefined) data.playingPosition = input.playingPosition;

    const updated = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "participants",
      oldData: existing,
      mutate: async (tx) => {
        if (existing.learnerId && Object.keys(learnerChanges).length > 0) {
          const learner = await tx.learner.findUniqueOrThrow({
            where: { id: existing.learnerId },
            select: { id: true, championshipId: true, bibNumber: true, upiNumber: true },
          });
          await updateLearner(tx, learner, learnerChanges);
        }
        return tx.participant.update({ where: { id: params.id }, data });
      },
      recordId: () => params.id,
      newData: { ...data, ...learnerChanges },
    });

    return NextResponse.json({ participant: updated });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "That bib number is already in use in this event" }, { status: 409 });
    }
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const existing = await prisma.participant.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Participant not found" }, { status: 404 });

    let ctx;
    try {
      ctx = await requireChampionshipAccess(existing.championshipId, ["TOURNAMENT_ADMIN"]);
    } catch (accessError) {
      if (!existing.tournamentTeamId) throw accessError;
      const team = await prisma.tournamentTeam.findUnique({
        where: { id: existing.tournamentTeamId },
        select: { name: true },
      });
      if (!team) throw accessError;
      ctx = await requireTeamAccess(existing.championshipId, team.name);
    }

    await withAudit({
      actorId: ctx.userId,
      operation: "DELETE",
      tableName: "participants",
      oldData: existing,
      mutate: (tx) => tx.participant.delete({ where: { id: params.id } }),
      recordId: () => params.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
