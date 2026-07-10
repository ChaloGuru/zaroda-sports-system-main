import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { championshipCircularSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const championshipId = searchParams.get("championshipId");
    if (!championshipId) return NextResponse.json({ error: "championshipId is required" }, { status: 400 });

    const circulars = await prisma.championshipCircular.findMany({
      where: { championshipId },
      orderBy: { createdAt: "desc" },
      include: { postedBy: { select: { name: true } } },
    });
    return NextResponse.json({ circulars });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const input = championshipCircularSchema.parse(body);
    const ctx = await requireChampionshipAccess(input.championshipId, ["TOURNAMENT_ADMIN"]);

    const circular = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "championship_circulars",
      mutate: (tx) =>
        tx.championshipCircular.create({
          data: {
            championshipId: input.championshipId,
            title: input.title,
            body: input.body,
            postedById: ctx.userId,
          },
          include: { postedBy: { select: { name: true } } },
        }),
      recordId: (result) => result.id,
      newData: input,
    });

    revalidatePath(`/championship/${input.championshipId}`);
    return NextResponse.json({ circular }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
