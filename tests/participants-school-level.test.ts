import { describe, it, expect, vi, beforeEach } from "vitest";

const gameFindUnique = vi.fn();
const championshipSchoolFindUnique = vi.fn();
const championshipFindUnique = vi.fn();
const bibRangeFindUnique = vi.fn();
const participantFindMany = vi.fn();
const txParticipantCreate = vi.fn();
const txLearnerCreate = vi.fn();

vi.mock("@/lib/authorize", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authorize")>("@/lib/authorize");
  return { ...actual, requireGameAccess: vi.fn().mockResolvedValue({ userId: "scorer-1" }) };
});
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

const txClient = { participant: { create: txParticipantCreate }, learner: { create: txLearnerCreate }, auditLog: { create: vi.fn() } };
vi.mock("@/lib/prisma", () => ({
  prisma: {
    game: { findUnique: (...a: unknown[]) => gameFindUnique(...a) },
    championshipSchool: { findUnique: (...a: unknown[]) => championshipSchoolFindUnique(...a) },
    championship: { findUnique: (...a: unknown[]) => championshipFindUnique(...a) },
    schoolBibRange: { findUnique: (...a: unknown[]) => bibRangeFindUnique(...a) },
    participant: { findMany: (...a: unknown[]) => participantFindMany(...a), findFirst: async () => null },
    learner: { findUnique: async () => null, findFirst: async () => null, findMany: async () => [] },
    $transaction: (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient),
  },
}));

const { POST } = await import("@/app/api/participants/route");

const CHAMP = "11111111-1111-1111-1111-111111111111";
const GAME = "22222222-2222-2222-2222-222222222222";
const SCHOOL = "33333333-3333-3333-3333-333333333333";

function post(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/participants", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ championshipId: CHAMP, gameId: GAME, schoolId: SCHOOL, firstName: "Amina", lastName: "Otieno", gender: "GIRLS", ...body }),
  });
}

describe("POST /api/participants - Primary/JS school entries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gameFindUnique.mockResolvedValue({ championshipId: CHAMP, schoolLevel: "PRIMARY" });
    championshipFindUnique.mockResolvedValue({ level: "NATIONAL", county: "Kisumu" });
    bibRangeFindUnique.mockResolvedValue({ schoolId: SCHOOL, rangeStart: 100, rangeEnd: 199 });
    participantFindMany.mockResolvedValue([]);
    txLearnerCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: "l-1", ...data }));
    txParticipantCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: "p-1", ...data }));
  });

  it("refuses a school's JS entry in a Primary event", async () => {
    championshipSchoolFindUnique.mockResolvedValue({ school: { name: "Manyonge", county: "Kisumu", schoolLevel: "JS" } });
    const res = await POST(post({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Manyonge \(JS\) can't enter a Primary event/);
    expect(txParticipantCreate).not.toHaveBeenCalled();
  });

  it("accepts the matching Primary entry and assigns a bib from its range", async () => {
    championshipSchoolFindUnique.mockResolvedValue({ school: { name: "Manyonge", county: "Kisumu", schoolLevel: "PRIMARY" } });
    const res = await POST(post({}));
    expect(res.status).toBe(201);
    expect(txParticipantCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ schoolId: SCHOOL, bibNumber: 100 }) });
  });

  it("accepts an unsplit (Senior School) school in any event", async () => {
    gameFindUnique.mockResolvedValue({ championshipId: CHAMP, schoolLevel: "SENIOR_SCHOOL" });
    championshipSchoolFindUnique.mockResolvedValue({ school: { name: "Kisumu Boys", county: "Kisumu", schoolLevel: null } });
    const res = await POST(post({}));
    expect(res.status).toBe(201);
  });

  it("refuses a game from a different championship", async () => {
    gameFindUnique.mockResolvedValue({ championshipId: "other-champ", schoolLevel: "PRIMARY" });
    const res = await POST(post({}));
    expect(res.status).toBe(404);
    expect(txParticipantCreate).not.toHaveBeenCalled();
  });
});
