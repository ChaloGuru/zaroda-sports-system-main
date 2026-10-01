import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireGameAccess, toErrorResponse, AuthorizationError } from "@/lib/authorize";
import { MAX_FIELD_ATTEMPTS, bestMark, isFieldEvent, normalizeAttempt } from "@/lib/field-events";

export const dynamic = "force-dynamic";

const fieldResultsSchema = z.object({
  results: z
    .array(
      z.object({
        participantId: z.string().uuid(),
        // Raw attempt entries as typed (blank = not yet taken); normalized here.
        attempts: z.array(z.string().max(20)).max(MAX_FIELD_ATTEMPTS),
        position: z.number().int().positive().nullable(),
      }),
    )
    .max(500),
});

/**
 * Saves a field event's (jump/throw) results in one go - the Chief Field
 * Judge's sheet. Each athlete's attempt series is stored as entered, their
 * best valid mark becomes `score`, and `position` is the placing the judge
 * confirmed (pre-filled by the panel from lib/field-events.ts rankFieldResults,
 * but editable - e.g. a High Jump countback on failures).
 */
export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const game = await prisma.game.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, category: true, isTimed: true },
    });
    if (!game) throw new AuthorizationError("Game not found", 404);

    const ctx = await requireGameAccess(game.id, ["TOURNAMENT_ADMIN", "SCOREKEEPER", "CHIEF_FIELD_JUDGE", "CHIEF_RECORDER"]);
    if (!isFieldEvent(game)) throw new Error(`${game.name} isn't a field event - enter its results in the matching results tab`);

    const input = fieldResultsSchema.parse(await request.json());

    const participantIds = input.results.map((r) => r.participantId);
    const participants = await prisma.participant.findMany({
      where: { id: { in: participantIds }, gameId: game.id },
      select: { id: true, firstName: true, lastName: true, bibNumber: true },
    });
    if (participants.length !== new Set(participantIds).size) {
      throw new Error("One or more athletes aren't entered in this event");
    }
    const byId = new Map(participants.map((p) => [p.id, p]));

    const rows = input.results.map((result) => {
      let attempts: string[];
      try {
        // Keep the series positional (attempt 3 stays attempt 3) but drop
        // trailing not-yet-taken attempts.
        const normalized = result.attempts.map(normalizeAttempt);
        while (normalized.length > 0 && normalized[normalized.length - 1] === null) normalized.pop();
        attempts = normalized.map((a) => a ?? "-");
      } catch (error) {
        const p = byId.get(result.participantId)!;
        throw new Error(`Bib ${p.bibNumber} (${p.firstName} ${p.lastName}): ${(error as Error).message}`);
      }
      const best = bestMark(attempts);
      return {
        participantId: result.participantId,
        fieldAttempts: attempts,
        score: best,
        // No valid mark means no placing, whatever was typed.
        position: best === null ? null : result.position,
      };
    });

    const updated = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "participants",
      oldData: { gameId: game.id },
      mutate: (tx) =>
        Promise.all(
          rows.map((row) =>
            tx.participant.update({
              where: { id: row.participantId },
              data: { fieldAttempts: row.fieldAttempts, score: row.score, position: row.position },
              select: { id: true, fieldAttempts: true, score: true, position: true },
            }),
          ),
        ),
      recordId: () => game.id,
      newData: { results: rows },
    });

    return NextResponse.json({ results: updated });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
