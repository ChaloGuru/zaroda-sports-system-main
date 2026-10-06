import { describe, it, expect, vi, beforeEach } from "vitest";

const gameFindUnique = vi.fn();
const championshipSchoolFindUnique = vi.fn();
const bibRangeFindUnique = vi.fn();
const learnerFindUnique = vi.fn();
const learnerFindFirst = vi.fn();
const learnerFindMany = vi.fn();
const participantFindFirst = vi.fn();
const participantFindMany = vi.fn();
const txLearnerCreate = vi.fn();
const txParticipantCreate = vi.fn();

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
    championship: { findUnique: async () => ({ level: "NATIONAL", county: "Kisumu" }) },
    schoolBibRange: { findUnique: (...a: unknown[]) => bibRangeFindUnique(...a) },
    learner: {
      findUnique: (...a: unknown[]) => learnerFindUnique(...a),
      findFirst: (...a: unknown[]) => learnerFindFirst(...a),
      findMany: (...a: unknown[]) => learnerFindMany(...a),
    },
    participant: {
      findFirst: (...a: unknown[]) => participantFindFirst(...a),
      findMany: (...a: unknown[]) => participantFindMany(...a),
    },
    $transaction: (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient),
  },
}));

const { POST } = await import("@/app/api/participants/route");
const { ageOn, normalizeUpi, photoContentType, updateLearner } = await import("@/lib/learners");

const CHAMP = "11111111-1111-1111-1111-111111111111";
const GAME = "22222222-2222-2222-2222-222222222222";
const SCHOOL = "33333333-3333-3333-3333-333333333333";
const LEARNER = "44444444-4444-4444-4444-444444444444";

function post(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/participants", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ championshipId: CHAMP, gameId: GAME, ...body }),
  });
}

function newLearner(body: Record<string, unknown> = {}): Request {
  return post({ schoolId: SCHOOL, firstName: "Amina", lastName: "Otieno", gender: "GIRLS", ...body });
}

beforeEach(() => {
  vi.clearAllMocks();
  gameFindUnique.mockResolvedValue({ championshipId: CHAMP, schoolLevel: "PRIMARY", name: "100m Girls" });
  championshipSchoolFindUnique.mockResolvedValue({ school: { name: "Manyonge", county: "Kisumu", schoolLevel: "PRIMARY" } });
  bibRangeFindUnique.mockResolvedValue({ schoolId: SCHOOL, rangeStart: 100, rangeEnd: 199 });
  learnerFindUnique.mockResolvedValue(null);
  learnerFindFirst.mockResolvedValue(null);
  learnerFindMany.mockResolvedValue([]);
  participantFindFirst.mockResolvedValue(null);
  participantFindMany.mockResolvedValue([]);
  txLearnerCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: "l-new", ...data }));
  txParticipantCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: "p-new", ...data }));
});

describe("registering a new learner", () => {
  it("creates the learner and their first entry with the same bib", async () => {
    learnerFindMany.mockResolvedValue([{ bibNumber: 100 }, { bibNumber: 101 }]);
    const res = await POST(newLearner({ upiNumber: "ab 12cd3" }));
    expect(res.status).toBe(201);
    expect(txLearnerCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ bibNumber: 102, upiNumber: "AB12CD3", schoolId: SCHOOL }) });
    expect(txParticipantCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ learnerId: "l-new", bibNumber: 102 }) });
  });

  it("refuses a UPI number already registered to another learner", async () => {
    learnerFindUnique.mockResolvedValue({ firstName: "Mary", lastName: "Akinyi" });
    const res = await POST(newLearner({ upiNumber: "AB12CD3" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/UPI AB12CD3 is already registered to Mary Akinyi/);
    expect(txLearnerCreate).not.toHaveBeenCalled();
  });

  it("points to the existing learner when the same name is registered again at the school", async () => {
    learnerFindFirst.mockResolvedValue({ bibNumber: 105, dateOfBirth: null });
    const res = await POST(newLearner());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/already registered for Manyonge \(Primary\) \(bib 105\) - add them to this event as an existing learner/);
  });

  it("allows two learners with one name when their dates of birth differ", async () => {
    learnerFindFirst.mockImplementation(async (args: { where: Record<string, unknown> }) =>
      args.where.firstName ? { bibNumber: 105, dateOfBirth: new Date("2013-02-01") } : null,
    );
    const res = await POST(newLearner({ dateOfBirth: "2014-06-30" }));
    expect(res.status).toBe(201);
  });

  it("refuses a bib that belongs to another learner", async () => {
    learnerFindFirst.mockImplementation(async (args: { where: Record<string, unknown> }) =>
      args.where.bibNumber === 150 ? { firstName: "Mary", lastName: "Akinyi" } : null,
    );
    const res = await POST(newLearner({ bibNumber: 150 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Bib 150 already belongs to Mary Akinyi/);
  });
});

describe("entering an existing learner in another event", () => {
  const learner = {
    id: LEARNER,
    championshipId: CHAMP,
    schoolId: SCHOOL,
    firstName: "Amina",
    lastName: "Otieno",
    gender: "GIRLS",
    dateOfBirth: null,
    bibNumber: 120,
    school: { name: "Manyonge", schoolLevel: "PRIMARY" },
  };

  it("reuses the learner's bib", async () => {
    learnerFindUnique.mockResolvedValue(learner);
    const res = await POST(post({ learnerId: LEARNER }));
    expect(res.status).toBe(201);
    expect(txLearnerCreate).not.toHaveBeenCalled();
    expect(txParticipantCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ learnerId: LEARNER, bibNumber: 120, firstName: "Amina" }) });
  });

  it("refuses entering the same learner twice in one event", async () => {
    learnerFindUnique.mockResolvedValue(learner);
    participantFindFirst.mockResolvedValue({ id: "p-1" });
    const res = await POST(post({ learnerId: LEARNER }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Amina Otieno is already entered in 100m Girls");
  });

  it("refuses an event at the other school level", async () => {
    learnerFindUnique.mockResolvedValue({ ...learner, school: { name: "Manyonge", schoolLevel: "JS" } });
    const res = await POST(post({ learnerId: LEARNER }));
    expect(res.status).toBe(400);
    expect(txParticipantCreate).not.toHaveBeenCalled();
  });

  it("refuses a learner from another championship", async () => {
    learnerFindUnique.mockResolvedValue({ ...learner, championshipId: "other" });
    const res = await POST(post({ learnerId: LEARNER }));
    expect(res.status).toBe(404);
  });
});

describe("updateLearner", () => {
  function fakeTx(conflicts: { learner?: unknown; upi?: unknown } = {}) {
    return {
      learner: {
        findFirst: vi.fn().mockResolvedValue(conflicts.learner ?? null),
        findUnique: vi.fn().mockResolvedValue(conflicts.upi ?? null),
        update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
          firstName: "Amina",
          lastName: "Otieno",
          gender: "GIRLS",
          dateOfBirth: null,
          bibNumber: 120,
          ...data,
        })),
      },
      participant: { findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn() },
    };
  }
  const current = { id: LEARNER, championshipId: CHAMP, bibNumber: 120, upiNumber: null };

  it("copies a new name and bib onto every one of the learner's entries", async () => {
    const tx = fakeTx();
    await updateLearner(tx as never, current, { lastName: "Achieng", bibNumber: 130 });
    expect(tx.participant.updateMany).toHaveBeenCalledWith({
      where: { learnerId: LEARNER },
      data: expect.objectContaining({ lastName: "Achieng", bibNumber: 130 }),
    });
  });

  it("refuses a bib held by another learner", async () => {
    const tx = fakeTx({ learner: { firstName: "Mary", lastName: "Akinyi" } });
    await expect(updateLearner(tx as never, current, { bibNumber: 130 })).rejects.toThrow("Bib 130 already belongs to Mary Akinyi");
    expect(tx.learner.update).not.toHaveBeenCalled();
  });

  it("refuses a UPI number held by another learner", async () => {
    const tx = fakeTx({ upi: { firstName: "Mary", lastName: "Akinyi" } });
    await expect(updateLearner(tx as never, current, { upiNumber: "zz99" })).rejects.toThrow("UPI ZZ99 is already registered to Mary Akinyi");
  });
});

describe("learner helpers", () => {
  it("works out age on a date", () => {
    expect(ageOn(new Date("2012-10-07"), new Date("2026-10-06"))).toBe(13);
    expect(ageOn(new Date("2012-10-06"), new Date("2026-10-06"))).toBe(14);
  });

  it("normalises UPI numbers", () => {
    expect(normalizeUpi(" ab 12 cd ")).toBe("AB12CD");
    expect(normalizeUpi("")).toBeNull();
    expect(normalizeUpi(null)).toBeNull();
  });

  it("recognises photos by their file signature", () => {
    expect(photoContentType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(photoContentType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(photoContentType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(photoContentType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
});
