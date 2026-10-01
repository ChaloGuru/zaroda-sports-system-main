import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { toErrorResponse } from "@/lib/authorize";
import { requireKsefAdmin, seedEditionConfig, type ConfigSource } from "@/lib/ksef";
import { ksefEditionCreateSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireKsefAdmin();
    const editions = await prisma.ksefEdition.findMany({
      orderBy: { year: "desc" },
      include: { _count: { select: { projects: true, schools: true, categories: true, judges: true } } },
    });
    return NextResponse.json({
      editions: editions.map((e) => ({
        ...e,
        discrepancyThreshold: e.discrepancyThreshold === null ? null : Number(e.discrepancyThreshold),
      })),
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * Creates a new competition year. Its categories/criteria start from the
 * standard KSEF structure, a deep copy of an earlier edition's
 * configuration, or empty - never from another edition's projects, scores
 * or results.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireKsefAdmin();
    const input = ksefEditionCreateSchema.parse(await request.json());

    const existing = await prisma.ksefEdition.findUnique({ where: { year: input.year }, select: { id: true } });
    if (existing) throw new Error(`A KSEF ${input.year} edition already exists`);

    const source: ConfigSource =
      input.configSource === "COPY"
        ? { kind: "COPY", fromEditionId: input.copyFromEditionId! }
        : { kind: input.configSource };

    const edition = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "ksef_editions",
      mutate: async (tx) => {
        const created = await tx.ksefEdition.create({
          data: {
            year: input.year,
            name: input.name || `KSEF ${input.year}`,
            startDate: input.startDate ?? null,
            endDate: input.endDate ?? null,
          },
        });
        await seedEditionConfig(tx, created.id, source);
        return created;
      },
      recordId: (result) => result.id,
      newData: input,
    });

    return NextResponse.json({ edition }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
