import { describe, it, expect, vi, beforeEach } from "vitest";

const learnerUpdateMany = vi.fn();
const auditCreate = vi.fn();
const circularFindUnique = vi.fn();
const champCircularFindUnique = vi.fn();
const blobDel = vi.fn();
const txCircularDelete = vi.fn();
const txCircularUpdate = vi.fn();
const txChampCircularUpdate = vi.fn();

vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: "admin-1", tenantId: null, roles: [{ role: "SUPER_ADMIN", championshipId: null }] } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@vercel/blob", () => ({ del: (...a: unknown[]) => blobDel(...a) }));
const tx = {
  circular: { delete: (...a: unknown[]) => txCircularDelete(...a), update: (...a: unknown[]) => txCircularUpdate(...a) },
  championshipCircular: { update: (...a: unknown[]) => txChampCircularUpdate(...a) },
  auditLog: { create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    learner: { updateMany: (...a: unknown[]) => learnerUpdateMany(...a) },
    auditLog: { create: (...a: unknown[]) => auditCreate(...a) },
    circular: { findUnique: (...a: unknown[]) => circularFindUnique(...a) },
    championshipCircular: { findUnique: (...a: unknown[]) => champCircularFindUnique(...a) },
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

const { purgeExpiredLearnerPhotos, PHOTO_RETENTION_DAYS, FACE_RETENTION_DAYS } = await import("@/lib/learner-photos");
const { GET: purgeCron } = await import("@/app/api/cron/purge-learner-photos/route");
const circularRoute = await import("@/app/api/circulars/[id]/route");
const champCircularRoute = await import("@/app/api/championship-circulars/[id]/route");

const ID = "11111111-1111-1111-1111-111111111111";
const params = { params: Promise.resolve({ id: ID }) };
const PDF = "https://abc123.public.blob.vercel-storage.com/circulars/1730000000000-Fixtures-x1.pdf";

beforeEach(() => vi.clearAllMocks());

describe("learner photo retention", () => {
  it("deletes photos and documents after six months, face descriptors after three years", async () => {
    learnerUpdateMany.mockResolvedValueOnce({ count: 42 }).mockResolvedValueOnce({ count: 5 }).mockResolvedValueOnce({ count: 7 });
    const now = new Date("2027-06-01T00:00:00Z");
    expect(await purgeExpiredLearnerPhotos(now)).toEqual({ photos: 42, documents: 5, faces: 7 });
    const days = (cutoff: Date) => Math.round((now.getTime() - cutoff.getTime()) / 86_400_000);
    const [photos, documents, faces] = learnerUpdateMany.mock.calls.map((c) => c[0]);
    expect(photos.data).toEqual({ photo: null, photoUpdatedAt: null });
    expect(photos.where.photoUpdatedAt).toEqual({ not: null });
    expect(days(photos.where.championship.endDate.lt)).toBe(PHOTO_RETENTION_DAYS);
    expect(documents.data).toEqual({ idDocument: null, idDocumentKind: null, idDocumentUpdatedAt: null });
    expect(days(documents.where.championship.endDate.lt)).toBe(PHOTO_RETENTION_DAYS);
    expect(faces.data).toEqual({ faceDescriptor: null });
    expect(days(faces.where.championship.endDate.lt)).toBe(FACE_RETENTION_DAYS);
  });

  it("runs only for Vercel's scheduler, with the cron secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    learnerUpdateMany.mockResolvedValue({ count: 3 });
    expect((await purgeCron(new Request("http://localhost/api/cron/purge-learner-photos"))).status).toBe(401);
    expect(learnerUpdateMany).not.toHaveBeenCalled();
    const res = await purgeCron(new Request("http://localhost/api/cron/purge-learner-photos", { headers: { authorization: "Bearer s3cret" } }));
    expect(await res.json()).toEqual({ deleted: { photos: 3, documents: 3, faces: 3 } });
    expect(auditCreate).toHaveBeenCalled();
  });

  it("refuses to run without a cron secret configured", async () => {
    delete process.env.CRON_SECRET;
    expect((await purgeCron(new Request("http://localhost/api/cron/purge-learner-photos", { headers: { authorization: "Bearer " } }))).status).toBe(503);
  });
});

describe("editing and deleting circulars", () => {
  it("deletes a platform circular and its PDF", async () => {
    circularFindUnique.mockResolvedValue({ id: ID, documentUrl: PDF });
    const res = await circularRoute.DELETE(new Request("http://localhost"), params);
    expect(res.status).toBe(200);
    expect(txCircularDelete).toHaveBeenCalledWith({ where: { id: ID } });
    expect(blobDel).toHaveBeenCalledWith(PDF);
  });

  it("removes the old PDF when an edit replaces it, and keeps it otherwise", async () => {
    circularFindUnique.mockResolvedValue({ id: ID, documentUrl: PDF });
    txCircularUpdate.mockResolvedValue({ id: ID });
    const patch = (body: Record<string, unknown>) =>
      circularRoute.PATCH(new Request("http://localhost", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), params);

    await patch({ title: "Fixtures (updated)" });
    expect(blobDel).not.toHaveBeenCalled();

    await patch({ documentUrl: null });
    expect(blobDel).toHaveBeenCalledWith(PDF);
  });

  it("edits a championship circular", async () => {
    champCircularFindUnique.mockResolvedValue({ id: ID, championshipId: "22222222-2222-2222-2222-222222222222" });
    txChampCircularUpdate.mockResolvedValue({ id: ID, title: "Venue change" });
    const res = await champCircularRoute.PATCH(
      new Request("http://localhost", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Venue change", body: "Day 2 moves to Kisumu Stadium." }) }),
      params,
    );
    expect(res.status).toBe(200);
    expect(txChampCircularUpdate).toHaveBeenCalledWith({ where: { id: ID }, data: { title: "Venue change", body: "Day 2 moves to Kisumu Stadium." } });
  });
});
