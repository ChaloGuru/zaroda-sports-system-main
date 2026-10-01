import { describe, it, expect, vi, beforeEach } from "vitest";

const requireChampionshipAccessMock = vi.fn();
const championshipFindUniqueOrThrow = vi.fn();
const championshipSchoolFindMany = vi.fn();
const championshipSchoolFindUnique = vi.fn();
const participantCount = vi.fn();
const txSchoolCreateMany = vi.fn();
const txLinkCreateMany = vi.fn();
const txBibRangeDeleteMany = vi.fn();
const txLinkDelete = vi.fn();
const txLinkCount = vi.fn();
const txParticipantCount = vi.fn();
const txBibRangeCount = vi.fn();
const txSchoolDelete = vi.fn();

vi.mock("@/lib/authorize", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authorize")>("@/lib/authorize");
  return { ...actual, requireChampionshipAccess: (...args: unknown[]) => requireChampionshipAccessMock(...args) };
});
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

const txClient = {
  school: { createMany: txSchoolCreateMany, delete: txSchoolDelete },
  championshipSchool: { createMany: txLinkCreateMany, delete: txLinkDelete, count: txLinkCount },
  schoolBibRange: { deleteMany: txBibRangeDeleteMany, count: txBibRangeCount },
  participant: { count: txParticipantCount },
  auditLog: { create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    championship: { findUniqueOrThrow: (...a: unknown[]) => championshipFindUniqueOrThrow(...a) },
    championshipSchool: {
      findMany: (...a: unknown[]) => championshipSchoolFindMany(...a),
      findUnique: (...a: unknown[]) => championshipSchoolFindUnique(...a),
    },
    participant: { count: (...a: unknown[]) => participantCount(...a) },
    $transaction: (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient),
  },
}));

const { POST } = await import("@/app/api/championship-schools/route");
const { DELETE } = await import("@/app/api/championship-schools/[id]/route");
const { AuthorizationError } = await import("@/lib/authorize");

const CHAMP = "11111111-1111-1111-1111-111111111111";

function post(body: unknown): Request {
  return new Request("http://localhost/api/championship-schools", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const del = (id: string) => DELETE(new Request(`http://localhost/api/championship-schools/${id}`, { method: "DELETE" }), { params: Promise.resolve({ id }) });

describe("POST /api/championship-schools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChampionshipAccessMock.mockResolvedValue({ userId: "admin-1" });
    championshipFindUniqueOrThrow.mockResolvedValue({ county: "Kisumu", level: "ZONE" });
    championshipSchoolFindMany.mockResolvedValue([{ school: { name: "Manyonge Primary" } }]);
  });

  it("requires tournament-admin access", async () => {
    requireChampionshipAccessMock.mockRejectedValue(new AuthorizationError("You do not have access to this championship"));
    const res = await POST(post({ championshipId: CHAMP, names: ["Oruba Primary"] }));
    expect(res.status).toBe(403);
    expect(requireChampionshipAccessMock).toHaveBeenCalledWith(CHAMP, ["TOURNAMENT_ADMIN"]);
    expect(txSchoolCreateMany).not.toHaveBeenCalled();
  });

  it("adds new schools in the championship's county and skips names already listed or repeated", async () => {
    const res = await POST(post({ championshipId: CHAMP, names: ["Oruba Primary", "manyonge primary", " Oruba Primary ", "St. Mary's"] }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ added: 2, skipped: 2 });

    const schools = txSchoolCreateMany.mock.calls[0]![0].data as Array<{ id: string; name: string; county: string }>;
    expect(schools.map((s) => [s.name, s.county])).toEqual([
      ["Oruba Primary", "Kisumu"],
      ["St. Mary's", "Kisumu"],
    ]);
    expect(txLinkCreateMany).toHaveBeenCalledWith({
      data: schools.map((s) => ({ championshipId: CHAMP, schoolId: s.id })),
    });
  });

  it("refuses an out-of-county school for a county-restricted championship", async () => {
    const res = await POST(post({ championshipId: CHAMP, names: ["Alliance"], county: "Kiambu" }));
    expect(res.status).toBe(403);
    expect(txSchoolCreateMany).not.toHaveBeenCalled();
  });

  it("allows any county for a national championship", async () => {
    championshipFindUniqueOrThrow.mockResolvedValue({ county: "Kisumu", level: "NATIONAL" });
    const res = await POST(post({ championshipId: CHAMP, names: ["Alliance"], county: "Kiambu" }));
    expect(res.status).toBe(201);
  });
});

describe("DELETE /api/championship-schools/[id]", () => {
  const link = { id: "link-1", championshipId: CHAMP, schoolId: "school-1", school: { id: "school-1", name: "Oruba Primary" } };

  beforeEach(() => {
    vi.clearAllMocks();
    requireChampionshipAccessMock.mockResolvedValue({ userId: "admin-1" });
    championshipSchoolFindUnique.mockResolvedValue(link);
    txLinkCount.mockResolvedValue(0);
    txParticipantCount.mockResolvedValue(0);
    txBibRangeCount.mockResolvedValue(0);
  });

  it("refuses while the school still has participants in the championship", async () => {
    participantCount.mockResolvedValue(3);
    const res = await del("link-1");
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Oruba Primary still has 3 participants/);
    expect(txLinkDelete).not.toHaveBeenCalled();
  });

  it("removes the link and bib range, and the school once nothing else uses it", async () => {
    participantCount.mockResolvedValue(0);
    const res = await del("link-1");
    expect(res.status).toBe(200);
    expect(txBibRangeDeleteMany).toHaveBeenCalledWith({ where: { championshipId: CHAMP, schoolId: "school-1" } });
    expect(txLinkDelete).toHaveBeenCalledWith({ where: { id: "link-1" } });
    expect(txSchoolDelete).toHaveBeenCalledWith({ where: { id: "school-1" } });
  });

  it("keeps the school row when another championship still lists it", async () => {
    participantCount.mockResolvedValue(0);
    txLinkCount.mockResolvedValue(1);
    await del("link-1");
    expect(txLinkDelete).toHaveBeenCalled();
    expect(txSchoolDelete).not.toHaveBeenCalled();
  });
});
