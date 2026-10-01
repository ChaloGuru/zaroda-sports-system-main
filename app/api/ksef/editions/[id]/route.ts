import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { toErrorResponse } from "@/lib/authorize";
import { getEditionOrThrow, requireKsefAdmin } from "@/lib/ksef";
import { KSEF_LEVELS } from "@/lib/ksef-config";
import { ksefEditionUpdateSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await requireKsefAdmin();
    const existing = await getEditionOrThrow(params.id);
    const input = ksefEditionUpdateSchema.parse(await request.json());

    // A closed edition only accepts being reopened (status change) - its
    // configuration and settings are otherwise frozen.
    const onlyStatus = Object.keys(input).every((k) => k === "status");
    if (existing.status === "CLOSED" && !onlyStatus) {
      throw new Error(`${existing.name} is closed - reopen it before changing its settings`);
    }

    // Keep the ladder in its natural order, whatever order it was ticked in.
    const levels = input.levels ? KSEF_LEVELS.filter((l) => (input.levels as string[]).includes(l)) : existing.levels;
    const currentLevel = input.currentLevel ?? existing.currentLevel;
    if (!levels.includes(currentLevel)) throw new Error("The current level must be one of the edition's levels");

    // Once projects have entered the ladder, changing it would strand their results.
    const levelsChanged = levels.join() !== existing.levels.join();
    if (levelsChanged && (await prisma.ksefResult.count({ where: { project: { editionId: existing.id } } })) > 0) {
      throw new Error("Projects have already entered this edition's levels - the level ladder can't change now");
    }

    const edition = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "ksef_editions",
      oldData: existing,
      mutate: (tx) =>
        tx.ksefEdition.update({
          where: { id: existing.id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
            ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
            ...(input.qualifiersPerCategory !== undefined ? { qualifiersPerCategory: input.qualifiersPerCategory } : {}),
            levels,
            currentLevel,
          },
        }),
      recordId: (result) => result.id,
      newData: input,
    });

    return NextResponse.json({ edition });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
