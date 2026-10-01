import type { Gender, BallSport, GameCategory } from "@prisma/client";

export interface DefaultGameTemplate {
  name: string;
  category: GameCategory;
  gender: Gender;
  schoolLevel: "PRIMARY" | "JS";
  /** Track/swimming/cross-country events are timed; field events and fixtures are not. */
  isTimed: boolean;
  /** Only for fixture-based games (ball games) - drives the standings points config. */
  sport: BallSport | null;
}

/**
 * Standard ball-games roster for a Primary/JS championship: every combination
 * of sport x gender x (Primary/JS) that a tenant would otherwise have to
 * recreate by hand each time. Auto-seeded on championship creation
 * (BALL_GAMES + PRIMARY_JS only) so a new tenant only has to add teams;
 * the Games tab still allows editing/adding/removing any of these afterward.
 */
const FULL_SCHOOL_LEVEL_SPORTS: BallSport[] = ["FOOTBALL", "HANDBALL", "NETBALL", "VOLLEYBALL", "CHESS"];
const JS_ONLY_SPORTS: BallSport[] = ["BASKETBALL"];

export const PRIMARY_JS_BALL_GAMES_TEMPLATE: DefaultGameTemplate[] = [
  ...FULL_SCHOOL_LEVEL_SPORTS.flatMap((sport): DefaultGameTemplate[] =>
    (["BOYS", "GIRLS"] as const).flatMap((gender) =>
      (["JS", "PRIMARY"] as const).map((schoolLevel) => ({
        name: `${sport} ${gender} ${schoolLevel}`,
        category: "BALL_GAMES" as const,
        gender,
        schoolLevel,
        isTimed: false,
        sport,
      })),
    ),
  ),
  ...JS_ONLY_SPORTS.flatMap((sport): DefaultGameTemplate[] =>
    (["BOYS", "GIRLS"] as const).map((gender) => ({
      name: `${sport} ${gender} JS`,
      category: "BALL_GAMES" as const,
      gender,
      schoolLevel: "JS" as const,
      isTimed: false,
      sport,
    })),
  ),
];

// ─────────────────────────────────────────────────────────────────────────
// Athletics: KPJSSA Term One Primary and Junior Schools Sports Activities
// 2026 circular. Auto-seeded on creation of every ATHLETICS + PRIMARY_JS
// championship; admins deactivate or delete whatever their event doesn't run.
// ─────────────────────────────────────────────────────────────────────────

const GENDER_WORD: Record<Gender, string> = { BOYS: "Boys", GIRLS: "Girls", MIXED: "Mixed" };
const LEVEL_WORD = { PRIMARY: "Primary", JS: "JS" } as const;

type EventSpec = {
  event: string;
  /** Which genders the event runs for - "B/G" on the circular means both. */
  genders: Gender[];
  isTimed: boolean;
  category?: GameCategory;
  sport?: BallSport;
};

const BG: Gender[] = ["BOYS", "GIRLS"];

const timed = (event: string, genders: Gender[] = BG): EventSpec => ({ event, genders, isTimed: true });
const scored = (event: string, genders: Gender[] = BG): EventSpec => ({ event, genders, isTimed: false });
const fixtures = (event: string, sport: BallSport): EventSpec => ({ event, genders: BG, isTimed: false, category: "BALL_GAMES", sport });

const FIELD_EVENTS: EventSpec[] = ["Long Jump", "High Jump", "Triple Jump", "Discus", "Shot Put", "Javelin"].map((e) => scored(e));

const PRIMARY_EVENTS: EventSpec[] = [
  // Team-format / judged events with no B/G split on the circular.
  scored("Kids Athletics (8-11 years)", ["MIXED"]),
  scored("Gymnastics", ["MIXED"]),
  // Track events (Primary)
  ...["100M", "200M", "400M", "800M", "1500M", "3000M"].map((e) => timed(e)),
  timed("2000M Walk Race"),
  timed("4x100M Relay"),
  timed("4x400M Relay"),
  timed("4x400M Mixed Relay", ["MIXED"]),
  // Field events
  ...FIELD_EVENTS,
  // Cross country
  timed("Cross Country U12 1200M"),
];

const JS_EVENTS: EventSpec[] = [
  // Swimming (the circular lists 50M Freestyle twice - created once)
  ...[
    "100M Individual Medley",
    "100M Breaststroke",
    "100M Butterfly",
    "100M Freestyle",
    "100M Backstroke",
    "50M Butterfly",
    "50M Breaststroke",
    "50M Backstroke",
    "50M Freestyle",
    "100M Medley Relay",
    "100M Freestyle Relay",
    "200M Freestyle Relay",
    "200M Medley Relay",
  ].map((e) => timed(`Swimming ${e}`)),
  // Team sports, run as fixtures
  fixtures("Rugby 7s", "RUGBY"),
  fixtures("Basketball 5x5", "BASKETBALL"),
  // Track events (Junior)
  ...["100M", "200M", "400M", "800M", "1500M", "3000M", "5000M"].map((e) => timed(e)),
  timed("3000M Walk Race"),
  timed("100M Hurdles", ["GIRLS"]),
  timed("110M Hurdles", ["BOYS"]),
  timed("400M Hurdles"),
  timed("2000M Steeplechase"),
  timed("4x100M Relay"),
  timed("4x400M Relay"),
  // Field events
  ...FIELD_EVENTS,
  // Cross country - distances differ by gender
  timed("Cross Country U15 3500M", ["BOYS"]),
  timed("Cross Country U15 2500M", ["GIRLS"]),
];

function expand(events: EventSpec[], schoolLevel: "PRIMARY" | "JS"): DefaultGameTemplate[] {
  return events.flatMap((spec) =>
    spec.genders.map((gender) => ({
      name: `${spec.event} ${GENDER_WORD[gender]} (${LEVEL_WORD[schoolLevel]})`,
      category: spec.category ?? "ATHLETICS",
      gender,
      schoolLevel,
      isTimed: spec.isTimed,
      sport: spec.sport ?? null,
    })),
  );
}

export const PRIMARY_JS_ATHLETICS_TEMPLATE: DefaultGameTemplate[] = [
  ...expand(PRIMARY_EVENTS, "PRIMARY"),
  ...expand(JS_EVENTS, "JS"),
];

/** The standard events to auto-create for a new championship, if any apply. */
export function defaultGamesFor(championship: { schoolLevel: string; category: string }): DefaultGameTemplate[] {
  if (championship.schoolLevel !== "PRIMARY_JS") return [];
  if (championship.category === "BALL_GAMES") return PRIMARY_JS_BALL_GAMES_TEMPLATE;
  if (championship.category === "ATHLETICS") return PRIMARY_JS_ATHLETICS_TEMPLATE;
  return [];
}
