import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { championshipCircularSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

/** Corrects a championship circular's title or message. */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const existing = await prisma.championshipCircular.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Circular not found" }, { status: 404 });
    const ctx = await requireChampionshipAccess(existing.championshipId, ["TOURNAMENT_ADMIN"]);
    const input = championshipCircularSchema.pick({ title: true, body: true }).partial().parse(await request.json());

    const updated = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "championship_circulars",
      oldData: existing,
      mutate: (tx) => tx.championshipCircular.update({ where: { id: params.id }, data: input }),
      recordId: () => params.id,
      newData: input,
    });

    revalidatePath(`/championship/${existing.championshipId}`);
    return NextResponse.json({ circular: updated });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const existing = await prisma.championshipCircular.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Circular not found" }, { status: 404 });

    const ctx = await requireChampionshipAccess(existing.championshipId, ["TOURNAMENT_ADMIN"]);

    await withAudit({
      actorId: ctx.userId,
      operation: "DELETE",
      tableName: "championship_circulars",
      oldData: existing,
      mutate: (tx) => tx.championshipCircular.delete({ where: { id: params.id } }),
      recordId: () => params.id,
    });

    revalidatePath(`/championship/${existing.championshipId}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
