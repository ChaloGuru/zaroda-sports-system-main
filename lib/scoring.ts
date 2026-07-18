// Pure, framework-free scoring/ranking functions. Kept dependency-free so they
// can be unit tested directly and reused identically on client (previews) and
// server (persisted results).

// ─────────────────────────────────────────────────────────────────────────
// Athletics: time parsing / formatting
// ─────────────────────────────────────────────────────────────────────────

const SECONDS_ONLY = /^\d+(\.\d+)?$/;
const MINUTES_SECONDS = /^(\d+):([0-5]?\d)(\.\d+)?$/;

/**
 * Parses "12.06" | "0:12.06" | "1:23.45" into a single float-seconds value.
 * Throws on malformed input or a seconds component >= 60.
 */
export function parseTimeToSeconds(input: string): number {
  const trimmed = input.trim();

  if (SECONDS_ONLY.test(trimmed)) {
    return parseFloat(trimmed);
  }

  const match = MINUTES_SECONDS.exec(trimmed);
  if (match) {
    const minutes = parseInt(match[1] as string, 10);
    const seconds = parseFloat(`${match[2]}${match[3] ?? ""}`);
    return minutes * 60 + seconds;
  }

  throw new Error(`Invalid time format: "${input}". Expected "ss.cc", "0:ss.cc", or "m:ss.cc"`);
}

/** Renders a float-seconds value back as "m:ss.cc" for display. */
export function formatSecondsToTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    throw new Error(`Invalid seconds value: ${totalSeconds}`);
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  const secondsStr = seconds.toFixed(2).padStart(5, "0");
  return `${minutes}:${secondsStr}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Bib seeding
// ─────────────────────────────────────────────────────────────────────────

export interface BibRange {
  schoolId: string;
  rangeStart: number;
  rangeEnd: number;
}

/**
 * Assigns the next sequential bib number for a school: (highest bib already
 * used by that school, or rangeStart - 1 if none) + 1, clamped to the
 * school's allotted SchoolBibRange block.
 */
export function assignNextBibNumber(
  schoolId: string,
  range: BibRange | undefined,
  usedBibNumbersForSchool: number[],
): number {
  if (!range) {
    throw new Error(`No bib range allocated for school ${schoolId}`);
  }
  if (range.rangeStart > range.rangeEnd) {
    throw new Error(`Invalid bib range for school ${schoolId}: start (${range.rangeStart}) > end (${range.rangeEnd})`);
  }

  const highestUsed = usedBibNumbersForSchool.length > 0 ? Math.max(...usedBibNumbersForSchool) : range.rangeStart - 1;
  const next = highestUsed + 1;

  if (next > range.rangeEnd) {
    throw new Error(`Bib range for school ${schoolId} is exhausted (${range.rangeStart}-${range.rangeEnd})`);
  }
  if (next < range.rangeStart) {
    return range.rangeStart;
  }
  return next;
}

/**
 * Validates that a new/updated bib range does not overlap any other school's
 * range within the same championship. Pass the existing ranges with the
 * range-being-edited already excluded.
 */
export function validateBibRangeNoOverlap(
  candidate: { schoolId: string; rangeStart: number; rangeEnd: number },
  otherRanges: BibRange[],
): void {
  if (candidate.rangeStart > candidate.rangeEnd) {
    throw new Error(`rangeStart (${candidate.rangeStart}) must be <= rangeEnd (${candidate.rangeEnd})`);
  }
  for (const existing of otherRanges) {
    if (existing.schoolId === candidate.schoolId) continue;
    const overlaps = candidate.rangeStart <= existing.rangeEnd && existing.rangeStart <= candidate.rangeEnd;
    if (overlaps) {
      throw new Error(
        `Bib range ${candidate.rangeStart}-${candidate.rangeEnd} overlaps existing allocation ` +
          `${existing.rangeStart}-${existing.rangeEnd} for school ${existing.schoolId}`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Lane seeding
// ─────────────────────────────────────────────────────────────────────────

/** Favorable-to-unfavorable lane priority order for an 8-lane track. */
export const DEFAULT_LANE_PRIORITY = [4, 5, 3, 6, 2, 7, 1, 8];

export interface LaneSeedInput {
  participantId: string;
  personalBest: number | null;
}

export interface LaneSeedResult {
  participantId: string;
  laneNumber: number;
}

/**
 * Seeds lanes within a heat by ascending personal best (fastest first),
 * assigning lanes per `lanePriority`. Participants without a personal best
 * are seeded last, in the order supplied.
 */
export function seedLanes(
  participants: LaneSeedInput[],
  lanePriority: number[] = DEFAULT_LANE_PRIORITY,
): LaneSeedResult[] {
  const sorted = [...participants].sort((a, b) => {
    if (a.personalBest == null && b.personalBest == null) return 0;
    if (a.personalBest == null) return 1;
    if (b.personalBest == null) return -1;
    return a.personalBest - b.personalBest;
  });

  return sorted.map((participant, index) => ({
    participantId: participant.participantId,
    laneNumber: lanePriority[index] ?? index + 1,
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// Ball games: standings computation
// ─────────────────────────────────────────────────────────────────────────

export type BallSport =
  | "FOOTBALL"
  | "BASKETBALL"
  | "VOLLEYBALL"
  | "HANDBALL"
  | "RUGBY"
  | "NETBALL"
  | "CHESS"
  | "TABLE_TENNIS"
  | "BADMINTON";

export interface SportConfig {
  drawAllowed: boolean;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  scoreLabel: string;
}

export const SPORT_CONFIGS: Record<BallSport, SportConfig> = {
  FOOTBALL: { drawAllowed: true, winPoints: 3, drawPoints: 1, lossPoints: 0, scoreLabel: "Goals" },
  BASKETBALL: { drawAllowed: false, winPoints: 2, drawPoints: 0, lossPoints: 1, scoreLabel: "Points" },
  VOLLEYBALL: { drawAllowed: false, winPoints: 3, drawPoints: 0, lossPoints: 0, scoreLabel: "Sets" },
  HANDBALL: { drawAllowed: true, winPoints: 2, drawPoints: 1, lossPoints: 0, scoreLabel: "Goals" },
  RUGBY: { drawAllowed: true, winPoints: 4, drawPoints: 2, lossPoints: 0, scoreLabel: "Points" },
  NETBALL: { drawAllowed: false, winPoints: 3, drawPoints: 0, lossPoints: 0, scoreLabel: "Goals" },
  // Indoor/dual-match games run at higher competition levels. Defaults below
  // are a reasonable starting point (chess team matches commonly split board
  // points and can be drawn; table tennis/badminton are decided by games won
  // so draws aren't possible) - adjust SPORT_CONFIGS here if your federation
  // uses a different points scale.
  CHESS: { drawAllowed: true, winPoints: 2, drawPoints: 1, lossPoints: 0, scoreLabel: "Boards" },
  TABLE_TENNIS: { drawAllowed: false, winPoints: 2, drawPoints: 0, lossPoints: 0, scoreLabel: "Games" },
  BADMINTON: { drawAllowed: false, winPoints: 2, drawPoints: 0, lossPoints: 0, scoreLabel: "Games" },
};

export interface CardCount {
  yellow: number;
  red: number;
}

export interface MatchResult {
  teamAId: string;
  teamBId: string;
  teamAScore: number;
  teamBScore: number;
  teamACards?: CardCount;
  teamBCards?: CardCount;
}

/**
 * A fixture decided by one team failing to turn up rather than being played
 * out. No scoreline exists - winnerId names the awarded (present) team, the
 * other side is the defaulter. Kept as a separate shape from MatchResult
 * (rather than a fake scoreline) so computeStandings can both award the win
 * and, per-team, distinguish "lost" from "never actually played".
 */
export interface WalkoverResult {
  teamAId: string;
  teamBId: string;
  winnerId: string;
}

export interface StandingRow {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  fairPlay: number;
}

export function computeStandings(
  teamIds: string[],
  results: MatchResult[],
  sport: BallSport,
  walkovers: WalkoverResult[] = [],
): StandingRow[] {
  const config = SPORT_CONFIGS[sport];
  const table = new Map<string, StandingRow>();

  for (const id of teamIds) {
    table.set(id, { teamId: id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0, fairPlay: 0 });
  }

  // A team that only ever defaulted - never played a real match, and never
  // even turned up to claim a walkover win - never actually competed in
  // this game, so it shouldn't be ranked alongside teams that did (even
  // though it's technically "0 played, 0 points" like a team that just
  // hasn't had its first fixture yet). A walkover *winner* did show up and
  // is credited normally; only the defaulting side is at risk of exclusion.
  const everAppeared = new Set<string>();
  const reallyPlayed = new Set<string>();
  for (const result of results) {
    everAppeared.add(result.teamAId);
    everAppeared.add(result.teamBId);
    reallyPlayed.add(result.teamAId);
    reallyPlayed.add(result.teamBId);
  }
  for (const walkover of walkovers) {
    everAppeared.add(walkover.teamAId);
    everAppeared.add(walkover.teamBId);
    reallyPlayed.add(walkover.winnerId);
  }
  const onlyEverDefaulted = new Set([...everAppeared].filter((id) => !reallyPlayed.has(id)));

  for (const walkover of walkovers) {
    const winner = table.get(walkover.winnerId);
    if (!winner) continue;
    const loserId = walkover.winnerId === walkover.teamAId ? walkover.teamBId : walkover.teamAId;
    winner.played++;
    winner.won++;
    winner.points += config.winPoints;

    // Only charge the defaulter a loss if it has at least one real match in
    // this standings scope; a team that never played at all is excluded
    // from the table entirely below, so crediting it a loss here would be
    // meaningless.
    const loser = table.get(loserId);
    if (loser && reallyPlayed.has(loserId)) {
      loser.played++;
      loser.lost++;
      loser.points += config.lossPoints;
    }
  }

  for (const result of results) {
    const teamA = table.get(result.teamAId);
    const teamB = table.get(result.teamBId);
    if (!teamA || !teamB) continue; // ignore results referencing teams outside this standings scope

    teamA.played++;
    teamB.played++;
    teamA.gf += result.teamAScore;
    teamA.ga += result.teamBScore;
    teamB.gf += result.teamBScore;
    teamB.ga += result.teamAScore;

    const cardsA = result.teamACards ?? { yellow: 0, red: 0 };
    const cardsB = result.teamBCards ?? { yellow: 0, red: 0 };
    teamA.fairPlay -= cardsA.yellow + cardsA.red * 3;
    teamB.fairPlay -= cardsB.yellow + cardsB.red * 3;

    if (result.teamAScore === result.teamBScore) {
      teamA.drawn++;
      teamB.drawn++;
      if (config.drawAllowed) {
        teamA.points += config.drawPoints;
        teamB.points += config.drawPoints;
      }
      // For sports where a draw isn't a valid outcome, a tied scoreline is a
      // data-entry edge case: no points are awarded to either side.
    } else if (result.teamAScore > result.teamBScore) {
      teamA.won++;
      teamA.points += config.winPoints;
      teamB.lost++;
      teamB.points += config.lossPoints;
    } else {
      teamB.won++;
      teamB.points += config.winPoints;
      teamA.lost++;
      teamA.points += config.lossPoints;
    }
  }

  for (const row of table.values()) {
    row.gd = row.gf - row.ga;
  }

  const rankedRows = Array.from(table.values()).filter((row) => !onlyEverDefaulted.has(row.teamId));
  return sortStandings(rankedRows, results, config);
}

function headToHeadPoints(teamId: string, tiedIds: Set<string>, results: MatchResult[], config: SportConfig): number {
  let points = 0;
  for (const result of results) {
    if (result.teamAId === teamId && tiedIds.has(result.teamBId)) {
      if (result.teamAScore > result.teamBScore) points += config.winPoints;
      else if (result.teamAScore < result.teamBScore) points += config.lossPoints;
      else if (config.drawAllowed) points += config.drawPoints;
    } else if (result.teamBId === teamId && tiedIds.has(result.teamAId)) {
      if (result.teamBScore > result.teamAScore) points += config.winPoints;
      else if (result.teamBScore < result.teamAScore) points += config.lossPoints;
      else if (config.drawAllowed) points += config.drawPoints;
    }
  }
  return points;
}

function sortStandings(rows: StandingRow[], results: MatchResult[], config: SportConfig): StandingRow[] {
  const byPointsDesc = [...rows].sort((a, b) => b.points - a.points);

  const groups: StandingRow[][] = [];
  for (const row of byPointsDesc) {
    const currentGroup = groups[groups.length - 1];
    if (currentGroup && currentGroup[0]?.points === row.points) {
      currentGroup.push(row);
    } else {
      groups.push([row]);
    }
  }

  return groups
    .map((group) => {
      if (group.length === 1) return group;
      const tiedIds = new Set(group.map((row) => row.teamId));
      return [...group].sort((a, b) => {
        const h2h = headToHeadPoints(b.teamId, tiedIds, results, config) - headToHeadPoints(a.teamId, tiedIds, results, config);
        if (h2h !== 0) return h2h;
        if (b.gd !== a.gd) return b.gd - a.gd;
        if (b.gf !== a.gf) return b.gf - a.gf;
        return b.fairPlay - a.fairPlay;
      });
    })
    .flat();
}

// ─────────────────────────────────────────────────────────────────────────
// Ball games: pool round-robin scheduling
// ─────────────────────────────────────────────────────────────────────────

export interface RoundRobinRound {
  round: number;
  pairs: Array<[string, string]>;
  /** The team sitting out this round, only present when the team count is odd. */
  byeTeamId?: string;
}

const BYE = Symbol("bye");

/**
 * Schedules a full round robin (every team plays every other team exactly
 * once) into rounds using the standard circle method. With an odd number of
 * teams, one team sits out (byeTeamId) each round - this is the only case
 * that needs a bye; with an even count every round is fully paired.
 */
export function generateRoundRobinSchedule(teamIds: string[]): RoundRobinRound[] {
  if (teamIds.length < 2) return [];

  const slots: Array<string | typeof BYE> = [...teamIds];
  if (slots.length % 2 !== 0) slots.push(BYE);

  const n = slots.length;
  const rounds: RoundRobinRound[] = [];
  let arrangement = [...slots];

  for (let round = 1; round <= n - 1; round++) {
    const pairs: Array<[string, string]> = [];
    let byeTeamId: string | undefined;

    for (let i = 0; i < n / 2; i++) {
      const a = arrangement[i];
      const b = arrangement[n - 1 - i];
      if (a === undefined || b === undefined) continue;
      if (a === BYE) byeTeamId = b as string;
      else if (b === BYE) byeTeamId = a;
      else pairs.push([a, b]);
    }

    rounds.push({ round, pairs, byeTeamId });

    // Rotate: keep the first slot fixed, cycle everyone else by one position.
    const [fixed, ...rest] = arrangement;
    const last = rest.pop();
    if (fixed !== undefined && last !== undefined) {
      arrangement = [fixed, last, ...rest];
    }
  }

  return rounds;
}

// ─────────────────────────────────────────────────────────────────────────
// Cross-cutting: placing → ranking points, and per-school-level standings
// ─────────────────────────────────────────────────────────────────────────

/** 1st-6th place -> overall ranking points; anything else scores 0. */
export const POSITION_POINTS: Record<number, number> = { 1: 7, 2: 5, 3: 4, 4: 3, 5: 2, 6: 1 };

export function pointsForPosition(position: number): number {
  return POSITION_POINTS[position] ?? 0;
}

// Matches Game.schoolLevel: within a PRIMARY_JS championship, each event is
// individually PRIMARY or JS; SENIOR_SCHOOL/TERTIARY championships only ever
// produce placings at that one matching level.
export type SchoolLevelCategory = "PRIMARY" | "JS" | "SENIOR_SCHOOL" | "TERTIARY";

export interface EventPlacing {
  schoolId: string;
  position: number;
  schoolLevel: SchoolLevelCategory;
}

export interface LevelStandings {
  PRIMARY: Map<string, number>;
  JS: Map<string, number>;
  SENIOR_SCHOOL: Map<string, number>;
  TERTIARY: Map<string, number>;
  OVERALL: Map<string, number>;
}

/** Aggregates event placings into per-school-level standings plus a combined OVERALL table. */
export function computeSchoolLevelStandings(placings: EventPlacing[]): LevelStandings {
  const standings: LevelStandings = {
    PRIMARY: new Map(),
    JS: new Map(),
    SENIOR_SCHOOL: new Map(),
    TERTIARY: new Map(),
    OVERALL: new Map(),
  };

  const addPoints = (map: Map<string, number>, schoolId: string, points: number) => {
    map.set(schoolId, (map.get(schoolId) ?? 0) + points);
  };

  for (const placing of placings) {
    const points = pointsForPosition(placing.position);
    if (points === 0) continue;

    addPoints(standings[placing.schoolLevel], placing.schoolId, points);
    addPoints(standings.OVERALL, placing.schoolId, points);
  }

  return standings;
}
