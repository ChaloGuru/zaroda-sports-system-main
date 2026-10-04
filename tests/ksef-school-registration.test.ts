import { describe, it, expect, vi, beforeEach } from "vitest";

const sendEmailMock = vi.fn();
vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
  escapeHtml: (s: string) => s,
}));

const db = {
  ksefEdition: { findUnique: vi.fn() },
  ksefSchoolRegistration: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
  school: { create: vi.fn(), delete: vi.fn() },
  ksefProject: { findUnique: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  ksefLearner: { deleteMany: vi.fn(), createMany: vi.fn() },
  ksefMentor: { deleteMany: vi.fn(), createMany: vi.fn() },
  ksefCategory: { findUnique: vi.fn() },
  ksefSubCategory: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({
  prisma: { ...db, $transaction: (fn: (tx: typeof db) => Promise<unknown>) => fn(db) },
}));

process.env.PUBLIC_SITE_URL = "https://zaroda.example";

const { POST: register } = await import("@/app/api/ksef/register/route");
const { PUT: updateProject } = await import("@/app/api/ksef/school-portal/projects/[id]/route");
const { isOwnUploadUrl, isRegistrationOpen, PORTAL_TOKEN_HEADER } = await import("@/lib/ksef-registration");

let ip = 0;
function request(url: string, method: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${++ip}`, ...headers },
    body: JSON.stringify(body),
  });
}

const OPEN_EDITION = { id: "ed-1", name: "KSEF 2026", status: "ACTIVE", registrationToken: "open-token", registrationClosesAt: null };
const SIGNUP = {
  token: "open-token",
  schoolName: "Alpha Girls",
  county: "Nairobi",
  subcounty: "Westlands",
  divisions: ["SENIOR_SCHOOL"],
  contactName: "Jane Patron",
  contactEmail: "Jane@Alpha.example",
};

describe("KSEF school self-registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.ksefEdition.findUnique.mockResolvedValue(OPEN_EDITION);
    sendEmailMock.mockResolvedValue({ sent: true });
  });

  it("emails the private link and never returns it", async () => {
    db.ksefSchoolRegistration.findUnique.mockResolvedValue(null);
    db.school.create.mockResolvedValue({ id: "school-1" });
    db.ksefSchoolRegistration.create.mockImplementation(({ data }) => ({ id: "reg-1", ...data }));

    const res = await register(request("http://x/api/ksef/register", "POST", SIGNUP));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ emailed: true, email: "jane@alpha.example" });
    const email = sendEmailMock.mock.calls[0]![0];
    expect(email.to).toBe("jane@alpha.example");
    expect(email.text).toMatch(/https:\/\/zaroda\.example\/ksef\/school\/[\w-]{40,}/);
    expect(JSON.stringify(json)).not.toContain("/ksef/school/");
    // Only the hash of the private token is stored.
    const stored = db.ksefSchoolRegistration.create.mock.calls[0]![0].data.tokenHash;
    expect(email.text).not.toContain(stored);
  });

  it("re-sends a fresh link to an already-registered email instead of creating a duplicate", async () => {
    db.ksefSchoolRegistration.findUnique.mockResolvedValue({ id: "reg-1", status: "PENDING" });
    db.ksefSchoolRegistration.update.mockResolvedValue({ id: "reg-1", contactEmail: "jane@alpha.example", contactName: "Jane", schoolName: "Alpha Girls", schoolId: "school-1" });

    const res = await register(request("http://x/api/ksef/register", "POST", SIGNUP));

    expect(res.status).toBe(200);
    expect(db.ksefSchoolRegistration.create).not.toHaveBeenCalled();
    expect(db.ksefSchoolRegistration.update).toHaveBeenCalledWith(expect.objectContaining({ data: { tokenHash: expect.any(String) } }));
  });

  it("undoes a new registration if the link can't be emailed", async () => {
    db.ksefSchoolRegistration.findUnique.mockResolvedValue(null);
    db.school.create.mockResolvedValue({ id: "school-1" });
    db.ksefSchoolRegistration.create.mockImplementation(({ data }) => ({ id: "reg-1", ...data }));
    db.school.delete.mockResolvedValue({});
    sendEmailMock.mockResolvedValue({ sent: false, error: "down" });

    const res = await register(request("http://x/api/ksef/register", "POST", SIGNUP));

    expect(res.status).toBe(400);
    expect(db.ksefSchoolRegistration.delete).toHaveBeenCalledWith({ where: { id: "reg-1" } });
    expect(db.school.delete).toHaveBeenCalledWith({ where: { id: "school-1" } });
  });

  it("refuses registrations once the deadline has passed", async () => {
    db.ksefEdition.findUnique.mockResolvedValue({ ...OPEN_EDITION, registrationClosesAt: new Date(Date.now() - 1000) });

    const res = await register(request("http://x/api/ksef/register", "POST", SIGNUP));

    expect(res.status).toBe(410);
    expect(db.ksefSchoolRegistration.create).not.toHaveBeenCalled();
  });

  it("requires the school to choose its level", async () => {
    const { divisions: _divisions, ...withoutLevel } = SIGNUP;
    const res = await register(request("http://x/api/ksef/register", "POST", withoutLevel));
    expect(res.status).toBe(400);
    expect(db.ksefSchoolRegistration.create).not.toHaveBeenCalled();
  });

  it("stores the level the school chose", async () => {
    db.ksefSchoolRegistration.findUnique.mockResolvedValue(null);
    db.school.create.mockResolvedValue({ id: "school-1" });
    db.ksefSchoolRegistration.create.mockImplementation(({ data }) => ({ id: "reg-1", ...data }));

    await register(request("http://x/api/ksef/register", "POST", SIGNUP));

    expect(db.ksefSchoolRegistration.create.mock.calls[0]![0].data.divisions).toEqual(["SENIOR_SCHOOL"]);
  });

  it("rejects an unknown open link", async () => {
    db.ksefEdition.findUnique.mockResolvedValue(null);
    const res = await register(request("http://x/api/ksef/register", "POST", SIGNUP));
    expect(res.status).toBe(404);
  });
});

describe("KSEF school portal", () => {
  const REGISTRATION = { id: "reg-1", editionId: "ed-1", schoolId: "school-1", status: "PENDING", divisions: ["JUNIOR_SCHOOL"], edition: OPEN_EDITION };
  const PROJECT_BODY = {
    categoryId: "11111111-1111-1111-1111-111111111111",
    title: "Solar dryer",
    learners: [{ firstName: "Amina", lastName: "Otieno", gender: "GIRLS" }],
    mentors: [{ name: "Mr Kamau" }],
  };
  const put = (body: unknown, token = "private-token") =>
    updateProject(request("http://x/api/ksef/school-portal/projects/p1", "PUT", body, { [PORTAL_TOKEN_HEADER]: token }), {
      params: Promise.resolve({ id: "p1" }),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    db.ksefSchoolRegistration.findUnique.mockResolvedValue(REGISTRATION);
    db.ksefCategory.findUnique.mockResolvedValue({ id: PROJECT_BODY.categoryId, editionId: "ed-1", isActive: true, name: "Physics", division: "JUNIOR_SCHOOL" });
    db.ksefProject.updateMany.mockResolvedValue({ count: 1 });
  });

  it("requires a valid private token", async () => {
    db.ksefSchoolRegistration.findUnique.mockResolvedValue(null);
    expect((await put(PROJECT_BODY, "wrong")).status).toBe(401);
  });

  it("can't edit another school's project", async () => {
    db.ksefProject.findUnique.mockResolvedValue({ id: "p1", registrationId: "someone-else", status: "DRAFT" });
    expect((await put(PROJECT_BODY)).status).toBe(404);
    expect(db.ksefProject.updateMany).not.toHaveBeenCalled();
  });

  it("can't edit a project once it has been submitted", async () => {
    db.ksefProject.findUnique.mockResolvedValue({ id: "p1", registrationId: "reg-1", status: "SUBMITTED" });
    expect((await put(PROJECT_BODY)).status).toBe(409);
  });

  it("limits projects to 2 learners", async () => {
    db.ksefProject.findUnique.mockResolvedValue({ id: "p1", registrationId: "reg-1", status: "DRAFT" });
    const learner = PROJECT_BODY.learners[0];
    expect((await put({ ...PROJECT_BODY, learners: [learner, learner, learner] })).status).toBe(400);
  });

  it("only accepts documents uploaded through Zaroda", async () => {
    db.ksefProject.findUnique.mockResolvedValue({ id: "p1", registrationId: "reg-1", status: "DRAFT" });
    expect((await put({ ...PROJECT_BODY, documentUrl: "https://evil.example/x.pdf" })).status).toBe(400);
  });

  it("rejects a project at a level the school didn't register for", async () => {
    db.ksefProject.findUnique.mockResolvedValue({ id: "p1", registrationId: "reg-1", status: "DRAFT" });
    db.ksefCategory.findUnique.mockResolvedValue({ id: PROJECT_BODY.categoryId, editionId: "ed-1", isActive: true, name: "Physics", division: "SENIOR_SCHOOL" });
    expect((await put(PROJECT_BODY)).status).toBe(400);
    expect(db.ksefProject.updateMany).not.toHaveBeenCalled();
  });

  it("saves the school's own draft", async () => {
    db.ksefProject.findUnique.mockResolvedValue({ id: "p1", registrationId: "reg-1", status: "DRAFT" });
    expect((await put(PROJECT_BODY)).status).toBe(200);
    expect(db.ksefProject.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1", status: "DRAFT" } }));
  });

  it("is read-only after the deadline", async () => {
    db.ksefSchoolRegistration.findUnique.mockResolvedValue({ ...REGISTRATION, edition: { ...OPEN_EDITION, registrationClosesAt: new Date(Date.now() - 1000) } });
    expect((await put(PROJECT_BODY)).status).toBe(409);
  });
});

describe("registration helpers", () => {
  it("treats registration as open only with a link, before the deadline, in a non-closed fair", () => {
    expect(isRegistrationOpen(OPEN_EDITION as never)).toBe(true);
    expect(isRegistrationOpen({ ...OPEN_EDITION, registrationToken: null } as never)).toBe(false);
    expect(isRegistrationOpen({ ...OPEN_EDITION, status: "CLOSED" } as never)).toBe(false);
    expect(isRegistrationOpen({ ...OPEN_EDITION, registrationClosesAt: new Date(Date.now() - 1) } as never)).toBe(false);
  });

  it("recognises only our own upload URLs", () => {
    expect(isOwnUploadUrl("https://abc.public.blob.vercel-storage.com/ksef-projects/x.pdf")).toBe(true);
    expect(isOwnUploadUrl("javascript:alert(1)")).toBe(false);
    expect(isOwnUploadUrl("http://abc.public.blob.vercel-storage.com/x.pdf")).toBe(false);
    expect(isOwnUploadUrl("https://evil.example/abc.public.blob.vercel-storage.com")).toBe(false);
  });
});
