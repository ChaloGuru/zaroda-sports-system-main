// No server-only imports here (no next-auth, no prisma) - this must be safe
// to import from client components too (see hooks/use-game-access.ts).

export interface ScopableRole {
  role: string;
  championshipId: string | null;
  gameCategory: string | null;
  ballSport: string | null;
  athleticsType: string | null;
}

export interface ScopableGame {
  category: string;
  sport: string | null;
  isTimed: boolean;
}

// Each discipline's official only ever works their own kind of event, even
// when the role has no explicit sport/discipline scoping set: track results
// belong to the Chief Track Judge, field (jumps/throws) results to the Chief
// Field Judge, and ball-game fixtures to the Game Coordinator.
const DISCIPLINE_ROLE_GAMES: Record<string, (game: ScopableGame) => boolean> = {
  CHIEF_TRACK_JUDGE: (game) => game.category === "ATHLETICS" && game.isTimed,
  CHIEF_FIELD_JUDGE: (game) => game.category === "ATHLETICS" && !game.isTimed,
  GAME_COORDINATOR: (game) => game.category === "BALL_GAMES" || game.category === "OTHER_GAMES",
};

/** True if `role`'s discipline and optional sport/discipline scoping fields (if any are set) match `game`. */
export function roleMatchesGameScope(role: ScopableRole, game: ScopableGame): boolean {
  const disciplineMatches = DISCIPLINE_ROLE_GAMES[role.role];
  if (disciplineMatches && !disciplineMatches(game)) return false;
  if (role.gameCategory && role.gameCategory !== game.category) return false;
  if (role.gameCategory === "BALL_GAMES" && role.ballSport && role.ballSport !== game.sport) return false;
  if (role.gameCategory === "ATHLETICS" && role.athleticsType) {
    const isTrack = role.athleticsType === "TRACK";
    if (isTrack !== game.isTimed) return false;
  }
  return true;
}
