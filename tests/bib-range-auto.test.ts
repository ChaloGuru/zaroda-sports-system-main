import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { ensureSchoolBibRange } = await import("@/lib/learners");

function fakeDb(opts: { existing?: unknown; ranges?: { rangeStart: number; rangeEnd: number }[]; highestEntry?: number; highestLearner?: number }) {
  const create = vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: "new-range", ...data }));
  return {
    create,
    db: {
      schoolBibRange: { findUnique: vi.fn().mockResolvedValue(opts.existing ?? null), findMany: vi.fn().mockResolvedValue(opts.ranges ?? []), create },
      participant: { findFirst: vi.fn().mockResolvedValue(opts.highestEntry ? { bibNumber: opts.highestEntry } : null) },
      learner: { findFirst: vi.fn().mockResolvedValue(opts.highestLearner ? { bibNumber: opts.highestLearner } : null) },
    },
  };
}

describe("a school with no bib range gets one automatically", () => {
  it("keeps an existing range", async () => {
    const { db, create } = fakeDb({ existing: { rangeStart: 100, rangeEnd: 199 } });
    expect(await ensureSchoolBibRange(db as never, "c", "s")).toEqual({ rangeStart: 100, rangeEnd: 199 });
    expect(create).not.toHaveBeenCalled();
  });

  it("allocates the next free block, the size most schools have", async () => {
    const { db, create } = fakeDb({
      ranges: [
        { rangeStart: 1, rangeEnd: 100 },
        { rangeStart: 101, rangeEnd: 200 },
        { rangeStart: 201, rangeEnd: 250 },
      ],
      highestEntry: 230,
    });
    await ensureSchoolBibRange(db as never, "c", "s");
    expect(create).toHaveBeenCalledWith({ data: { championshipId: "c", schoolId: "s", rangeStart: 251, rangeEnd: 350 } });
  });

  it("starts after bibs given outside any range, and uses 50 when there are no ranges yet", async () => {
    const { db, create } = fakeDb({ highestLearner: 612 });
    await ensureSchoolBibRange(db as never, "c", "s");
    expect(create).toHaveBeenCalledWith({ data: { championshipId: "c", schoolId: "s", rangeStart: 613, rangeEnd: 662 } });
  });
});
