/**
 * Seeded single-elimination bracket from pool standings.
 *
 * Qualifiers are seeded by finishing place, then pool order: every pool winner
 * (A1, B1, C1...) is seeded above every runner-up (A2, B2...). The bracket is
 * laid out the standard way (1 v 8, 4 v 5, 2 v 7, 3 v 6 for eight), so the two
 * best seeds can only meet in the final. When the number of qualifiers is not
 * a power of two the top seeds get a bye. Teams from the same pool are kept
 * apart in the first round wherever a swap allows it.
 */

export interface Qualifier {
  teamId: string;
  poolIndex: number;
  /** 1 = pool winner, 2 = runner-up... */
  place: number;
}

/** One first-round slot: two teams, or one team with a bye (teamB null). */
export interface BracketMatch {
  teamA: Qualifier;
  teamB: Qualifier | null;
}

export function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

/** Seed numbers in bracket order: [1, 8, 4, 5, 2, 7, 3, 6] for 8. Adjacent pairs meet. */
export function bracketSeedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const doubled = order.length * 2;
    order = order.flatMap((seed) => [seed, doubled + 1 - seed]);
  }
  return order;
}

/** "Final" for 2 teams, "Semifinal" for 4, "Quarterfinal" for 8, "Round of 16"... */
export function firstRoundName(size: number): string {
  if (size <= 2) return "Final";
  if (size === 4) return "Semifinal";
  if (size === 8) return "Quarterfinal";
  return `Round of ${size}`;
}

/** Pool standings (team ids, best first) -> qualifiers seeded 1..n. */
export function seedQualifiers(poolStandings: string[][], topPerPool: number): Qualifier[] {
  const seeds: Qualifier[] = [];
  for (let place = 1; place <= topPerPool; place++) {
    poolStandings.forEach((teams, poolIndex) => {
      const teamId = teams[place - 1];
      if (teamId) seeds.push({ teamId, poolIndex, place });
    });
  }
  return seeds;
}

const clash = (a: Qualifier | null, b: Qualifier | null) => !!a && !!b && a.poolIndex === b.poolIndex;

/** The first round, in bracket order (winners of adjacent matches meet next). */
export function buildBracket(seeds: Qualifier[]): BracketMatch[] {
  if (seeds.length < 2) return [];
  const size = nextPowerOfTwo(seeds.length);
  const order = bracketSeedOrder(size);
  const matches: BracketMatch[] = [];
  for (let i = 0; i < order.length; i += 2) {
    const a = seeds[(order[i] as number) - 1] ?? null;
    const b = seeds[(order[i + 1] as number) - 1] ?? null;
    if (a) matches.push({ teamA: a, teamB: b });
    else if (b) matches.push({ teamA: b, teamB: null });
  }
  // Keep pool-mates apart in round one: swap the lower-seeded teams of two
  // matches when that clears the clash without making a new one.
  for (const m of matches) {
    if (!clash(m.teamA, m.teamB)) continue;
    const other = matches.find(
      (o) => o !== m && o.teamB && !clash(m.teamA, o.teamB) && !clash(o.teamA, m.teamB),
    );
    if (other) [m.teamB, other.teamB] = [other.teamB, m.teamB];
  }
  return matches;
}
