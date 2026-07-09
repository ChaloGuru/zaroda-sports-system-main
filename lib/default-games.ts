import type { Gender, BallSport } from "@prisma/client";

export interface DefaultGameTemplate {
  name: string;
  gender: Gender;
  schoolLevel: "PRIMARY" | "JS";
  sport: BallSport;
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
        gender,
        schoolLevel,
        sport,
      })),
    ),
  ),
  ...JS_ONLY_SPORTS.flatMap((sport): DefaultGameTemplate[] =>
    (["BOYS", "GIRLS"] as const).map((gender) => ({
      name: `${sport} ${gender} JS`,
      gender,
      schoolLevel: "JS" as const,
      sport,
    })),
  ),
];
