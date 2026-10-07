import { describe, it, expect, vi, beforeEach } from "vitest";

const championshipFindUnique = vi.fn();
const teamFindMany = vi.fn();
const teamFindUnique = vi.fn();
const participantFindMany = vi.fn();
const gameFindMany = vi.fn();
const getAuthContext = vi.fn();

vi.mock("@/lib/auth", () => ({ authOptions: {} }));
const getServerSession = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
vi.mock("@/lib/authorize", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authorize")>("@/lib/authorize");
  return { ...actual, getAuthContext: (...a: unknown[]) => getAuthContext(...a) };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    championship: { findUnique: (...a: unknown[]) => championshipFindUnique(...a) },
    tournamentTeam: { findMany: (...a: unknown[]) => teamFindMany(...a), findUnique: (...a: unknown[]) => teamFindUnique(...a) },
    participant: { findMany: (...a: unknown[]) => participantFindMany(...a) },
    game: { findMany: (...a: unknown[]) => gameFindMany(...a) },
  },
}));

const { GET: listTeams } = await import("@/app/api/tournament-teams/route");
const { GET: listParticipants } = await import("@/app/api/participants/route");
const { GET: listGames } = await import("@/app/api/games/route");
const { generatePaymentReference } = await import("@/lib/paystack");

const CHAMP = "11111111-1111-1111-1111-111111111111";
const OWN_TEAM = "22222222-2222-2222-2222-222222222222";
const OTHER_TEAM = "33333333-3333-3333-3333-333333333333";
const teamManager = { userId: "tm-1", tenantId: null, roles: [{ role: "TEAM_MANAGER", championshipId: CHAMP, organizationName: "Manyonge Football" }] };

/** The championship row each lookup asks for, with a future end date so roles are active. */
function championship(isPublished: boolean) {
  championshipFindUnique.mockResolvedValue({ id: CHAMP, tenantId: "tenant", isPublished, endDate: new Date("2999-01-01") });
}

const team = (id: string, name: string) => ({ id, name, contactName: `${name} contact`, contactEmail: "c@x.co", contactPhone: "0700", notes: "n" });

describe("team managers see only their own team's private details", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthContext.mockResolvedValue(teamManager);
    teamFindMany.mockResolvedValue([team(OWN_TEAM, "Manyonge Football"), team(OTHER_TEAM, "Kisumu Boys Football")]);
  });

  it("shows contact details for their own team, not other teams", async () => {
    championship(true);
    const res = await listTeams(new Request(`http://localhost/api/tournament-teams?championshipId=${CHAMP}`));
    const { teams } = await res.json();
    expect(teams.find((t: { id: string }) => t.id === OWN_TEAM).contactEmail).toBe("c@x.co");
    expect(teams.find((t: { id: string }) => t.id === OTHER_TEAM).contactEmail).toBeUndefined();
  });

  it("lists only their own team before the championship is published", async () => {
    championship(false);
    const res = await listTeams(new Request(`http://localhost/api/tournament-teams?championshipId=${CHAMP}`));
    const { teams } = await res.json();
    expect(teams.map((t: { id: string }) => t.id)).toEqual([OWN_TEAM]);
  });

  it("gets their own roster with dates of birth, but no one else's", async () => {
    championship(true);
    participantFindMany.mockResolvedValue([{ id: "p", firstName: "A", dateOfBirth: "2013-01-01", notes: "x", learnerId: "l" }]);

    teamFindUnique.mockResolvedValue({ name: "Manyonge Football", championshipId: CHAMP });
    const own = await (await listParticipants(new Request(`http://localhost/api/participants?tournamentTeamId=${OWN_TEAM}`))).json();
    expect(own.participants[0].dateOfBirth).toBe("2013-01-01");

    teamFindUnique.mockResolvedValue({ name: "Kisumu Boys Football", championshipId: CHAMP });
    const other = await (await listParticipants(new Request(`http://localhost/api/participants?tournamentTeamId=${OTHER_TEAM}`))).json();
    expect(other.participants[0].dateOfBirth).toBeUndefined();
    expect(other.participants[0].notes).toBeUndefined();
  });

  it("doesn't get dates of birth for a whole event's entries", async () => {
    championship(true);
    participantFindMany.mockResolvedValue([{ id: "p", firstName: "A", dateOfBirth: "2013-01-01", notes: "x", learnerId: "l" }]);
    const res = await listParticipants(new Request(`http://localhost/api/participants?gameId=44444444-4444-4444-4444-444444444444&championshipId=${CHAMP}`));
    expect((await res.json()).participants[0].dateOfBirth).toBeUndefined();
  });
});

describe("unpublished championships", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gameFindMany.mockResolvedValue([{ id: "g" }]);
  });

  it("hide their events from the public", async () => {
    getAuthContext.mockResolvedValue(null);
    championship(false);
    const res = await listGames(new Request(`http://localhost/api/games?championshipId=${CHAMP}`));
    expect(await res.json()).toEqual({ games: [] });
    expect(gameFindMany).not.toHaveBeenCalled();
  });

  it("show their events to someone with a role in them", async () => {
    getServerSession.mockResolvedValue({ user: { id: teamManager.userId, tenantId: null, roles: teamManager.roles } });
    championship(false);
    const res = await listGames(new Request(`http://localhost/api/games?championshipId=${CHAMP}`));
    expect((await res.json()).games).toHaveLength(1);
  });
});

describe("payment references", () => {
  it("carry 128 random bits from the secure generator", () => {
    const a = generatePaymentReference("sub");
    expect(a).toMatch(/^sub_\d+_[0-9a-f]{32}$/);
    expect(generatePaymentReference("sub")).not.toBe(a);
  });
});
