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

/** True if `role`'s optional sport/discipline scoping fields (if any are set) match `game`. */
export function roleMatchesGameScope(role: ScopableRole, game: ScopableGame): boolean {
  if (role.gameCategory && role.gameCategory !== game.category) return false;
  if (role.gameCategory === "BALL_GAMES" && role.ballSport && role.ballSport !== game.sport) return false;
  if (role.gameCategory === "ATHLETICS" && role.athleticsType) {
    const isTrack = role.athleticsType === "TRACK";
    if (isTrack !== game.isTimed) return false;
  }
  return true;
}
