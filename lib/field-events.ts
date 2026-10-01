// Field-event (jumps & throws) result logic. No server-only imports - shared by
// the Field Results panel (live best-mark/position preview) and
// app/api/games/[id]/field-results (which recomputes the best mark itself).

/** Max attempts recorded per athlete: 3 in qualifying rounds, up to 6 for finalists. */
export const MAX_FIELD_ATTEMPTS = 6;

/** A recorded attempt: a mark in metres ("5.32"), a foul ("X"), or a pass ("-"). */
export type FieldAttempt = string;

const FIELD_EVENT_PATTERN = /jump|vault|discus|shot\s*put|javelin|hammer|throw/i;
const VERTICAL_JUMP_PATTERN = /high\s*jump|pole\s*vault/i;

/** True for jumps/throws measured in metres, as opposed to timed races or points-scored events (Gymnastics, Kids Athletics). */
export function isFieldEvent(game: { category: string; isTimed: boolean; name: string }): boolean {
  return game.category === "ATHLETICS" && !game.isTimed && FIELD_EVENT_PATTERN.test(game.name);
}

/**
 * High Jump / Pole Vault are judged on the best height cleared (one mark per
 * athlete), not a series of measured attempts like the horizontal jumps and
 * throws.
 */
export function isVerticalJump(name: string): boolean {
  return VERTICAL_JUMP_PATTERN.test(name);
}

/**
 * Normalizes what a judge typed for one attempt. Blank -> null (not taken
 * yet); X/F/FOUL -> "X"; -/P/PASS -> "-"; a mark -> metres to 2 decimals.
 * Throws on anything else so a typo never silently becomes a foul.
 */
export function normalizeAttempt(input: string): FieldAttempt | null {
  const value = input.trim().toUpperCase().replace(/M$/, "").trim();
  if (value === "") return null;
  if (value === "X" || value === "F" || value === "FOUL") return "X";
  if (value === "-" || value === "P" || value === "PASS") return "-";
  if (!/^\d{1,3}(\.\d{1,3})?$/.test(value)) {
    throw new Error(`"${input.trim()}" isn't a valid mark - enter metres (e.g. 5.32), X for a foul or - for a pass`);
  }
  const metres = Number(value);
  if (metres <= 0 || metres >= 150) throw new Error(`${metres}m is outside the range of a valid field mark`);
  return metres.toFixed(2);
}

/** Valid measured marks only (fouls/passes dropped), best first. */
export function validMarks(attempts: readonly FieldAttempt[]): number[] {
  return attempts
    .map((a) => Number(a))
    .filter((m) => Number.isFinite(m) && m > 0)
    .sort((a, b) => b - a);
}

/** The athlete's best valid mark, or null if every attempt was a foul/pass. */
export function bestMark(attempts: readonly FieldAttempt[]): number | null {
  return validMarks(attempts)[0] ?? null;
}

/**
 * Places athletes by best mark. Ties on the best mark are broken by the
 * second-best mark, then third, and so on (World Athletics rule for
 * horizontal jumps and throws); athletes still level share the place, and
 * the next place is skipped. Athletes with no valid mark aren't placed.
 */
export function rankFieldResults<T extends { id: string; attempts: readonly FieldAttempt[] }>(
  rows: readonly T[],
): Map<string, number> {
  const scored = rows
    .map((row) => ({ id: row.id, marks: validMarks(row.attempts) }))
    .filter((row) => row.marks.length > 0);

  const compare = (a: number[], b: number[]) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const diff = (b[i] ?? 0) - (a[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  };
  scored.sort((a, b) => compare(a.marks, b.marks));

  const positions = new Map<string, number>();
  scored.forEach((row, index) => {
    const previous = scored[index - 1];
    const tiedWithPrevious = previous && compare(previous.marks, row.marks) === 0;
    positions.set(row.id, tiedWithPrevious ? positions.get(previous.id)! : index + 1);
  });
  return positions;
}
