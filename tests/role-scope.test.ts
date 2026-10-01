import { describe, it, expect } from "vitest";
import { roleMatchesGameScope } from "@/lib/role-scope";

const unscoped = (role: string) => ({ role, championshipId: "c1", gameCategory: null, ballSport: null, athleticsType: null });

const track = { category: "ATHLETICS", sport: null, isTimed: true };
const field = { category: "ATHLETICS", sport: null, isTimed: false };
const football = { category: "BALL_GAMES", sport: "FOOTBALL", isTimed: false };

describe("roleMatchesGameScope - discipline officials", () => {
  it("keeps each chief judge / coordinator to their own result format even without explicit scoping", () => {
    expect(roleMatchesGameScope(unscoped("CHIEF_TRACK_JUDGE"), track)).toBe(true);
    expect(roleMatchesGameScope(unscoped("CHIEF_TRACK_JUDGE"), field)).toBe(false);
    expect(roleMatchesGameScope(unscoped("CHIEF_TRACK_JUDGE"), football)).toBe(false);

    expect(roleMatchesGameScope(unscoped("CHIEF_FIELD_JUDGE"), field)).toBe(true);
    expect(roleMatchesGameScope(unscoped("CHIEF_FIELD_JUDGE"), track)).toBe(false);
    expect(roleMatchesGameScope(unscoped("CHIEF_FIELD_JUDGE"), football)).toBe(false);

    expect(roleMatchesGameScope(unscoped("GAME_COORDINATOR"), football)).toBe(true);
    expect(roleMatchesGameScope(unscoped("GAME_COORDINATOR"), track)).toBe(false);
  });

  it("leaves championship-wide roles unrestricted", () => {
    for (const game of [track, field, football]) {
      expect(roleMatchesGameScope(unscoped("TOURNAMENT_ADMIN"), game)).toBe(true);
      expect(roleMatchesGameScope(unscoped("SCOREKEEPER"), game)).toBe(true);
    }
  });
});
