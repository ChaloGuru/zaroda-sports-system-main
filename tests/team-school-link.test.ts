import { describe, it, expect, vi, beforeEach } from "vitest";

const championshipSchoolFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { championshipSchool: { findMany: (...a: unknown[]) => championshipSchoolFindMany(...a) } },
}));

const { resolveTeamSchoolId } = await import("@/lib/championship-schools");

describe("resolveTeamSchoolId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("links a Primary/JS team to the school entry matching its game's level", async () => {
    championshipSchoolFindMany.mockResolvedValue([
      { school: { id: "manyonge-primary", schoolLevel: "PRIMARY" } },
      { school: { id: "manyonge-js", schoolLevel: "JS" } },
    ]);
    await expect(resolveTeamSchoolId("champ-1", " Manyonge ", "JS")).resolves.toBe("manyonge-js");
    await expect(resolveTeamSchoolId("champ-1", "Manyonge", "PRIMARY")).resolves.toBe("manyonge-primary");
    expect(championshipSchoolFindMany).toHaveBeenCalledWith({
      where: { championshipId: "champ-1", school: { name: { equals: "Manyonge", mode: "insensitive" } } },
      select: { school: { select: { id: true, schoolLevel: true } } },
    });
  });

  it("doesn't link when the school's entry for that level was removed", async () => {
    championshipSchoolFindMany.mockResolvedValue([{ school: { id: "manyonge-primary", schoolLevel: "PRIMARY" } }]);
    await expect(resolveTeamSchoolId("champ-1", "Manyonge", "JS")).resolves.toBeNull();
  });

  it("links a Senior School team to the school's single entry", async () => {
    championshipSchoolFindMany.mockResolvedValue([{ school: { id: "kisumu-boys", schoolLevel: null } }]);
    await expect(resolveTeamSchoolId("champ-1", "Kisumu Boys", "SENIOR_SCHOOL")).resolves.toBe("kisumu-boys");
  });

  it("returns null for organizations that aren't on the school list", async () => {
    championshipSchoolFindMany.mockResolvedValue([]);
    await expect(resolveTeamSchoolId("champ-1", "Thunder FC", null)).resolves.toBeNull();
  });
});
