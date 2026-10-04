import { describe, it, expect, vi, beforeEach } from "vitest";

const resultFindMany = vi.fn();
const editionFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ksefResult: { findMany: (...args: unknown[]) => resultFindMany(...args) },
    ksefEdition: { findMany: (...args: unknown[]) => editionFindMany(...args) },
  },
}));

const { GET } = await import("@/app/api/ksef/public-results/route");

const RESULT = {
  id: "r1",
  totalScore: "87.50",
  rank: 1,
  status: "QUALIFIED",
  publishedAt: new Date("2026-10-01T00:00:00Z"),
  project: {
    code: "J-0001",
    title: "Solar dryer",
    school: { name: "Alpha School", subcounty: "Westlands", county: "Nairobi", region: "Nairobi" },
    category: { id: "c1", name: "Physics", division: "JUNIOR_SCHOOL", sortOrder: 1 },
    subCategory: null,
    learners: [{ firstName: "Amina", lastName: "Otieno" }],
  },
};

describe("GET /api/ksef/public-results", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists only editions and levels with published results", async () => {
    resultFindMany.mockResolvedValue([{ level: "SUB_COUNTY", project: { editionId: "e1" } }]);
    editionFindMany.mockResolvedValue([{ id: "e1", name: "KSEF 2026", year: 2026 }]);

    const json = await (await GET(new Request("http://x/api/ksef/public-results"))).json();

    expect(resultFindMany.mock.calls[0]![0].where).toMatchObject({ isPublished: true });
    expect(json.editions).toEqual([{ id: "e1", name: "KSEF 2026", year: 2026, levels: ["SUB_COUNTY"] }]);
  });

  it("returns a level's published results with names and scores but no private learner fields", async () => {
    resultFindMany.mockResolvedValue([RESULT]);

    const json = await (await GET(new Request("http://x/api/ksef/public-results?editionId=e1&level=SUB_COUNTY"))).json();
    const query = resultFindMany.mock.calls[0]![0];

    expect(query.where).toMatchObject({ level: "SUB_COUNTY", isPublished: true, project: { editionId: "e1" } });
    expect(query.select.project.select.learners.select).toEqual({ firstName: true, lastName: true });
    expect(query.select.project.select).not.toHaveProperty("mentors");
    expect(json.results[0]).toMatchObject({
      learners: ["Amina Otieno"],
      school: "Alpha School",
      unit: "Westlands, Nairobi",
      totalScore: 87.5,
      rank: 1,
      qualified: true,
    });
  });

  it("rejects an unknown level", async () => {
    const res = await GET(new Request("http://x/api/ksef/public-results?editionId=e1&level=MOON"));
    expect(res.status).toBe(400);
  });
});
