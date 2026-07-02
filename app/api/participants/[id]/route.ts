import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { participantStatusSchema, timeInputSchema, genderSchema } from "@/lib/validations";
import { parseTimeToSeconds } from "@/lib/scoring";

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
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const existing = await prisma.participant.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Participant not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(existing.championshipId, ["TOURNAMENT_ADMIN", "SCOREKEEPER", "OFFICIAL"]);

    const body: unknown = await request.json();
    const input = participantUpdateSchema.parse(body);

    const data: Record<string, unknown> = {};
    if (input.firstName !== undefined) data.firstName = input.firstName;
    if (input.lastName !== undefined) data.lastName = input.lastName;
    if (input.gender !== undefined) data.gender = input.gender;
    if (input.bibNumber !== undefined) data.bibNumber = input.bibNumber;
    if (input.status !== undefined) data.status = input.status;
    if (input.timeInput !== undefined) data.timeTaken = parseTimeToSeconds(input.timeInput);
    if (input.score !== undefined) data.score = input.score;
    if (input.position !== undefined) data.position = input.position;
    if (input.laneNumber !== undefined) data.laneNumber = input.laneNumber;
    if (input.isQualified !== undefined) data.isQualified = input.isQualified;
    if (input.notes !== undefined) data.notes = input.notes;

    const updated = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "participants",
      oldData: existing,
      mutate: (tx) => tx.participant.update({ where: { id: params.id }, data }),
      recordId: () => params.id,
      newData: data,
    });

    return NextResponse.json({ participant: updated });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "That bib number is already in use in this championship" }, { status: 409 });
    }
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const existing = await prisma.participant.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Participant not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(existing.championshipId, ["TOURNAMENT_ADMIN"]);

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
