import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { schoolSignupSchema } from "@/lib/validations";
import { countyCode, regionOfCounty } from "@/lib/kenya-counties";
import { isInJurisdiction, isOpenToSchool, sameArea } from "@/lib/jurisdiction";

const accountFindUnique = vi.fn();
const userFindUnique = vi.fn();
const championshipFindUnique = vi.fn();
const championshipFindMany = vi.fn();
const schoolListFindMany = vi.fn();
const txUserCreate = vi.fn();
const txAccountCreate = vi.fn();
const txSchoolCreateMany = vi.fn();
const txSchoolUpdateMany = vi.fn();
const txLinkCreateMany = vi.fn();
const txLinkUpdateMany = vi.fn();
const txRoleCreate = vi.fn();
const requireAuth = vi.fn();

vi.mock("@/lib/authorize", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authorize")>("@/lib/authorize");
  return { ...actual, requireAuth: (...a: unknown[]) => requireAuth(...a) };
});
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async () => ({ allowed: true }),
  getClientIp: () => "1.1.1.1",
}));

const tx = {
  user: { create: (...a: unknown[]) => txUserCreate(...a) },
  schoolAccount: { create: (...a: unknown[]) => txAccountCreate(...a) },
  userRole: { create: (...a: unknown[]) => txRoleCreate(...a) },
  school: { createMany: (...a: unknown[]) => txSchoolCreateMany(...a), updateMany: (...a: unknown[]) => txSchoolUpdateMany(...a) },
  championshipSchool: { createMany: (...a: unknown[]) => txLinkCreateMany(...a), updateMany: (...a: unknown[]) => txLinkUpdateMany(...a) },
  auditLog: { create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    schoolAccount: { findUnique: (...a: unknown[]) => accountFindUnique(...a) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    championship: { findUnique: (...a: unknown[]) => championshipFindUnique(...a), findMany: (...a: unknown[]) => championshipFindMany(...a) },
    championshipSchool: { findMany: (...a: unknown[]) => schoolListFindMany(...a) },
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

const { POST: signup } = await import("@/app/api/school-signup/route");
const { GET: listChampionships, POST: push } = await import("@/app/api/school-account/championships/route");
const { GET: listBases } = await import("@/app/api/school-signup/bases/route");

const CHAMP = "11111111-1111-1111-1111-111111111111";

const form = {
  knecCode: "44700123",
  schoolName: "Manyonge",
  baseName: "Uriri Base",
  zone: "Uriri Zone",
  subcounty: "Uriri",
  county: "Migori",
  contactName: "Jane Teacher",
  email: "Jane@School.ke",
  phone: "0712345678",
  password: "Str0ng-pass!",
  confirmPassword: "Str0ng-pass!",
};

const account = {
  id: "acc-1",
  userId: "teacher-1",
  knecCode: "44700123",
  schoolName: "Manyonge",
  baseName: "Uriri Base",
  zone: "Uriri Zone",
  subcounty: "Uriri",
  county: "Migori",
  region: "Nyanza",
};

const post = (url: string, body: Record<string, unknown>) =>
  new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const signUp = (body: Record<string, unknown> = {}) => signup(post("/api/school-signup", { ...form, ...body }));
const pushSchool = () => push(post("/api/school-account/championships", { championshipId: CHAMP }));

const openChampionship = {
  id: CHAMP,
  level: "BASE",
  county: "Migori",
  jurisdiction: "uriri  base",
  schoolLevel: "PRIMARY_JS",
  isPublished: true,
  endDate: new Date("2999-01-01"),
  registrationClosesAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  accountFindUnique.mockResolvedValue(null);
  userFindUnique.mockResolvedValue(null);
  txUserCreate.mockResolvedValue({ id: "teacher-1" });
  txAccountCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: "acc-1", ...data }));
  requireAuth.mockResolvedValue({ userId: "teacher-1", roles: [] });
  championshipFindUnique.mockResolvedValue(openChampionship);
  championshipFindMany.mockResolvedValue([]);
  schoolListFindMany.mockResolvedValue([]);
});

describe("county codes and regions", () => {
  it("follow the official county order", () => {
    expect(countyCode("Mombasa")).toBe("01");
    expect(countyCode("Migori")).toBe("44");
    expect(countyCode("Nairobi")).toBe("47");
  });

  it("place counties in their region", () => {
    expect(regionOfCounty("Migori")).toBe("Nyanza");
    expect(regionOfCounty("Nakuru")).toBe("Rift Valley");
    expect(regionOfCounty("Nairobi")).toBe("Nairobi");
    expect(regionOfCounty("Mombasa")).toBe("Coast");
  });
});

describe("signing up a school", () => {
  it("captures its base, zone, sub-county, county and region", async () => {
    expect((await signUp()).status).toBe(201);
    expect(txAccountCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        knecCode: "44700123",
        schoolName: "Manyonge",
        baseName: "Uriri Base",
        zone: "Uriri Zone",
        subcounty: "Uriri",
        county: "Migori",
        region: "Nyanza",
        userId: "teacher-1",
      }),
    });
    expect(txUserCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ email: "jane@school.ke" }) });
  });

  it("gives the account no championship role", async () => {
    await signUp();
    expect(txUserCreate.mock.calls[0]?.[0].data.roles).toBeUndefined();
  });

  it("needs the base and zone", async () => {
    expect((await signUp({ baseName: "" })).status).toBe(400);
    expect((await signUp({ zone: "" })).status).toBe(400);
  });

  it("refuses a code that doesn't start with the county's code", async () => {
    const res = await signUp({ knecCode: "42700123" });
    expect(res.status).toBe(400);
    expect(txUserCreate).not.toHaveBeenCalled();
  });

  it("refuses a code that isn't all numbers", async () => {
    expect((await signUp({ knecCode: "44A00123" })).status).toBe(400);
    expect(txUserCreate).not.toHaveBeenCalled();
  });

  it("refuses a KNEC code that's already been used", async () => {
    accountFindUnique.mockResolvedValue({ id: "acc-0" });
    const res = await signUp();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("This KNEC code has already been used to sign up a school");
    expect(txUserCreate).not.toHaveBeenCalled();
  });

  it("lets the database settle two signups with one code at the same moment", async () => {
    txAccountCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "5.22.0", meta: { target: ["knecCode"] } }),
    );
    const res = await signUp();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("This KNEC code has already been used to sign up a school");
  });

  it("refuses an email that's already in use", async () => {
    userFindUnique.mockResolvedValue({ id: "other" });
    expect((await signUp()).status).toBe(409);
  });

  it("treats a code with spaces as the same code", () => {
    expect(schoolSignupSchema.parse({ ...form, knecCode: " 44700123 " }).knecCode).toBe("44700123");
  });
});

describe("a school's jurisdiction", () => {
  const school = { baseName: "Uriri Base", zone: "Uriri Zone", subcounty: "Uriri", county: "Migori", region: "Nyanza" };
  const at = (level: string, jurisdiction: string | null, county = "Migori") => ({ level, county, jurisdiction });

  it("matches its own area at every level", () => {
    expect(isInJurisdiction(school, at("BASE", "uriri base"))).toBe(true);
    expect(isInJurisdiction(school, at("ZONE", "Uriri Zone"))).toBe(true);
    expect(isInJurisdiction(school, at("SUB_COUNTY", "Uriri"))).toBe(true);
    expect(isInJurisdiction(school, at("COUNTY", null))).toBe(true);
    expect(isInJurisdiction(school, at("REGIONAL", "Nyanza"))).toBe(true);
  });

  it("refuses another area at every level", () => {
    expect(isInJurisdiction(school, at("BASE", "Awendo Base"))).toBe(false);
    expect(isInJurisdiction(school, at("ZONE", "Awendo Zone"))).toBe(false);
    expect(isInJurisdiction(school, at("SUB_COUNTY", "Awendo"))).toBe(false);
    expect(isInJurisdiction(school, at("COUNTY", null, "Kisumu"))).toBe(false);
    expect(isInJurisdiction(school, at("REGIONAL", "Coast"))).toBe(false);
  });

  it("treats the different ways of writing an area as one place", () => {
    expect(sameArea("Oruba", "ORUBA  BASE")).toBe(true);
    expect(sameArea("Oruba Base", "oruba inter school base")).toBe(true);
    expect(sameArea("Migori", "Migori County")).toBe(true);
    expect(sameArea("Uriri", "Uriri Sub-County")).toBe(true);
    expect(sameArea("Murang'a", "Muranga")).toBe(true);
    expect(sameArea("Oruba", "Awendo")).toBe(false);
    expect(sameArea("South Base", "North Base")).toBe(false);
  });

  it("keeps an area that is nothing but one of those words", () => {
    expect(sameArea("Base", "base")).toBe(true);
    expect(sameArea("Base", "Oruba")).toBe(false);
  });

  it("is open at national level", () => {
    expect(isInJurisdiction(school, at("NATIONAL", null, "Nairobi"))).toBe(true);
  });

  it("doesn't block a school an admin typed in with only a name", () => {
    expect(isInJurisdiction({ county: "Migori" }, at("ZONE", "Uriri Zone"))).toBe(true);
  });
});

describe("which Inter School championships a school can push to", () => {
  const school = { baseName: "Oruba Base", county: "Migori" };
  const base = (county: string, jurisdiction: string | null) => ({ level: "BASE", county, jurisdiction });

  it("matches a championship however its area was typed", () => {
    expect(isOpenToSchool(school, base("MIGORI County", "oruba"))).toBe(true);
  });

  it("leaves a championship with no area open to its county, even one saved blank", () => {
    expect(isOpenToSchool(school, base("Migori", null))).toBe(true);
    expect(isOpenToSchool(school, base("Migori", ""))).toBe(true);
    expect(isOpenToSchool(school, base("Kisumu", null))).toBe(false);
  });

  it("refuses another base, and other levels", () => {
    expect(isOpenToSchool(school, base("Migori", "Awendo Base"))).toBe(false);
    expect(isOpenToSchool(school, { level: "ZONE", county: "Migori", jurisdiction: null })).toBe(false);
  });
});

describe("pushing to a championship", () => {
  beforeEach(() => accountFindUnique.mockResolvedValue(account));

  it("adds the school's Primary and JS entries, holding its area", async () => {
    expect((await pushSchool()).status).toBe(201);
    const { data } = txSchoolCreateMany.mock.calls[0]?.[0] as { data: Array<Record<string, unknown>> };
    expect(data.map((s) => s.schoolLevel)).toEqual(["PRIMARY", "JS"]);
    expect(data[0]).toMatchObject({ zone: "Uriri Zone", subcounty: "Uriri", county: "Migori", region: "Nyanza" });
    const links = txLinkCreateMany.mock.calls[0]?.[0] as { data: Array<Record<string, unknown>> };
    expect(links.data[0]).toMatchObject({ championshipId: CHAMP, schoolAccountId: "acc-1" });
  });

  it("gives the school account no team manager role", async () => {
    await pushSchool();
    expect(txRoleCreate).not.toHaveBeenCalled();
  });

  it("takes over entries an admin already typed in", async () => {
    schoolListFindMany.mockResolvedValue([
      { id: "link-1", schoolId: "s1", schoolAccountId: null, school: { schoolLevel: "PRIMARY" } },
      { id: "link-2", schoolId: "s2", schoolAccountId: null, school: { schoolLevel: "JS" } },
    ]);
    expect((await pushSchool()).status).toBe(201);
    expect(txLinkUpdateMany).toHaveBeenCalledWith({ where: { id: { in: ["link-1", "link-2"] } }, data: { schoolAccountId: "acc-1" } });
    expect(txSchoolCreateMany).not.toHaveBeenCalled();
  });

  it("only works for a signed-up school", async () => {
    accountFindUnique.mockResolvedValue(null);
    expect((await pushSchool()).status).toBe(403);
  });

  it("refuses another base", async () => {
    championshipFindUnique.mockResolvedValue({ ...openChampionship, jurisdiction: "Awendo Base" });
    const res = await pushSchool();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("This championship is outside your school's jurisdiction");
    expect(txSchoolCreateMany).not.toHaveBeenCalled();
  });

  it("refuses another county", async () => {
    championshipFindUnique.mockResolvedValue({ ...openChampionship, county: "Kisumu" });
    expect((await pushSchool()).status).toBe(403);
    expect(txSchoolCreateMany).not.toHaveBeenCalled();
  });

  it("stops at Inter School", async () => {
    championshipFindUnique.mockResolvedValue({ ...openChampionship, level: "ZONE", jurisdiction: "Uriri Zone" });
    const res = await pushSchool();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Schools push to Inter School only - above that, learners move up by promotion");
  });

  it("refuses when registration has closed", async () => {
    championshipFindUnique.mockResolvedValue({ ...openChampionship, registrationClosesAt: new Date("2020-01-01") });
    expect((await pushSchool()).status).toBe(400);
  });

  it("refuses an unpublished championship", async () => {
    championshipFindUnique.mockResolvedValue({ ...openChampionship, isPublished: false });
    expect((await pushSchool()).status).toBe(404);
  });

  it("refuses a name another account holds", async () => {
    schoolListFindMany.mockResolvedValue([{ id: "link-1", schoolId: "s1", schoolAccountId: "acc-9", school: { schoolLevel: "PRIMARY" } }]);
    expect((await pushSchool()).status).toBe(409);
    expect(txSchoolCreateMany).not.toHaveBeenCalled();
  });

  it("does nothing when the school has already pushed", async () => {
    schoolListFindMany.mockResolvedValue([{ id: "link-1", schoolId: "s1", schoolAccountId: "acc-1", school: { schoolLevel: "PRIMARY" } }]);
    expect((await pushSchool()).status).toBe(200);
    expect(txSchoolCreateMany).not.toHaveBeenCalled();
  });

  it("lists an older championship typed differently, and hides another base's", async () => {
    championshipFindMany.mockResolvedValue([
      { id: "a", name: "Uriri", level: "BASE", county: "MIGORI COUNTY", jurisdiction: "uriri" },
      { id: "b", name: "Older", level: "BASE", county: "Migori", jurisdiction: "" },
      { id: "c", name: "Awendo", level: "BASE", county: "Migori", jurisdiction: "Awendo Base" },
    ]);
    const { championships } = await (await listChampionships()).json();
    expect(championships.map((c: { id: string }) => c.id)).toEqual(["a", "b"]);
  });

  it("offers a county's bases once each as a school signs up", async () => {
    championshipFindMany.mockResolvedValue([
      { county: "Migori", jurisdiction: "Oruba Base" },
      { county: "MIGORI COUNTY", jurisdiction: "oruba" },
      { county: "Migori", jurisdiction: "Awendo Base" },
      { county: "Kisumu", jurisdiction: "Kondele Base" },
    ]);
    const res = await listBases(new Request("http://localhost/api/school-signup/bases?county=Migori"));
    expect((await res.json()).bases).toEqual(["Awendo Base", "Oruba Base"]);
  });

  it("lists the school's championships, marking those it has pushed to", async () => {
    schoolListFindMany.mockResolvedValue([{ championshipId: CHAMP }]);
    championshipFindMany.mockResolvedValue([{ id: CHAMP, name: "Uriri Inter School" }]);
    const res = await listChampionships();
    expect((await res.json()).championships).toEqual([{ id: CHAMP, name: "Uriri Inter School", joined: true }]);
  });
});
