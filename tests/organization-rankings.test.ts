import { describe, it, expect, vi, beforeEach } from "vitest";

const participantFindMany = vi.fn();
const computeChampionshipTeamStandingsMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    participant: { findMany: (...args: unknown[]) => participantFindMany(...args) },
  },
}));

vi.mock("@/lib/team-standings", () => ({
  computeChampionshipTeamStandings: (...args: unknown[]) => computeChampionshipTeamStandingsMock(...args),
}));

const { computeOrganizationRankings } = await import("@/lib/organization-rankings");

describe("computeOrganizationRankings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    computeChampionshipTeamStandingsMock.mockResolvedValue([]);
    participantFindMany.mockResolvedValue([]);
  });

  it("sums athletics placing points per school across multiple events", async () => {
    participantFindMany.mockResolvedValue([
      { position: 1, gender: "BOYS", game: { schoolLevel: "PRIMARY" }, school: { name: "Manyonge Primary" }, tournamentTeam: null },
      { position: 3, gender: "BOYS", game: { schoolLevel: "PRIMARY" }, school: { name: "Manyonge Primary" }, tournamentTeam: null },
    ]);

    const rows = await computeOrganizationRankings("champ-1");

    expect(rows).toEqual([{ name: "Manyonge Primary", points: 7 + 4, position: 1 }]);
  });

  it("combines athletics points and ball-game points under the same organization name", async () => {
    participantFindMany.mockResolvedValue([
      { position: 2, gender: "BOYS", game: { schoolLevel: "PRIMARY" }, school: { name: "Starehe" }, tournamentTeam: null },
    ]);
    computeChampionshipTeamStandingsMock.mockResolvedValue([
      {
        gameId: "g1",
        gameName: "Football Boys",
        gender: "BOYS",
        schoolLevel: "PRIMARY",
        sport: "FOOTBALL",
        standings: [{ teamId: "t1", teamName: "Starehe", points: 9, played: 3, won: 3, drawn: 0, lost: 0, gf: 6, ga: 1, gd: 5, fairPlay: 0 }],
      },
    ]);

    const rows = await computeOrganizationRankings("champ-1");

    // 5 points from a 2nd-place athletics finish + 9 ball-game points, same org name.
    expect(rows).toEqual([{ name: "Starehe", points: 5 + 9, position: 1 }]);
  });

  it("filters by gender, excluding non-matching participants and games", async () => {
    participantFindMany.mockImplementation(({ where }: { where: { gender?: string } }) => {
      const all = [
        { position: 1, gender: "BOYS", game: { schoolLevel: "PRIMARY" }, school: { name: "Boys School" }, tournamentTeam: null },
        { position: 1, gender: "GIRLS", game: { schoolLevel: "PRIMARY" }, school: { name: "Girls School" }, tournamentTeam: null },
      ];
      return Promise.resolve(where.gender ? all.filter((p) => p.gender === where.gender) : all);
    });

    const boysOnly = await computeOrganizationRankings("champ-1", { gender: "BOYS" });
    expect(boysOnly.map((r) => r.name)).toEqual(["Boys School"]);

    const overall = await computeOrganizationRankings("champ-1", { gender: "OVERALL" });
    expect(overall.map((r) => r.name).sort()).toEqual(["Boys School", "Girls School"]);
  });

  it("filters by school level for both athletics and ball-game rows", async () => {
    participantFindMany.mockResolvedValue([
      { position: 1, gender: "BOYS", game: { schoolLevel: "PRIMARY" }, school: { name: "Primary School" }, tournamentTeam: null },
      { position: 1, gender: "BOYS", game: { schoolLevel: "TERTIARY" }, school: { name: "College" }, tournamentTeam: null },
    ]);
    computeChampionshipTeamStandingsMock.mockResolvedValue([
      {
        gameId: "g1",
        gameName: "Netball",
        gender: "GIRLS",
        schoolLevel: "TERTIARY",
        sport: "NETBALL",
        standings: [{ teamId: "t1", teamName: "College", points: 6, played: 2, won: 2, drawn: 0, lost: 0, gf: 4, ga: 0, gd: 4, fairPlay: 0 }],
      },
    ]);

    const primaryOnly = await computeOrganizationRankings("champ-1", { schoolLevel: "PRIMARY" });
    expect(primaryOnly).toEqual([{ name: "Primary School", points: 7, position: 1 }]);

    const tertiaryOnly = await computeOrganizationRankings("champ-1", { schoolLevel: "TERTIARY" });
    expect(tertiaryOnly).toEqual([{ name: "College", points: 7 + 6, position: 1 }]);
  });

  it("sorts descending by total points and assigns sequential positions", async () => {
    participantFindMany.mockResolvedValue([
      { position: 6, gender: "BOYS", game: { schoolLevel: "PRIMARY" }, school: { name: "Low Scorer" }, tournamentTeam: null },
      { position: 1, gender: "BOYS", game: { schoolLevel: "PRIMARY" }, school: { name: "High Scorer" }, tournamentTeam: null },
    ]);

    const rows = await computeOrganizationRankings("champ-1");

    expect(rows.map((r) => r.name)).toEqual(["High Scorer", "Low Scorer"]);
    expect(rows.map((r) => r.position)).toEqual([1, 2]);
  });

  it("ignores placings outside the top 6 (zero points) and falls back to team name when no school is linked", async () => {
    participantFindMany.mockResolvedValue([
      { position: 8, gender: "BOYS", game: { schoolLevel: "PRIMARY" }, school: null, tournamentTeam: { name: "Unranked Team" } },
    ]);

    const rows = await computeOrganizationRankings("champ-1");
    expect(rows).toEqual([]);
  });
});
