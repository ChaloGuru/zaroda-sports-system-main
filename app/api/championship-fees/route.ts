import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireChampionshipAccess, toErrorResponse } from "@/lib/authorize";
import { championshipFeeSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const championshipId = searchParams.get("championshipId");
    if (!championshipId) return NextResponse.json({ error: "championshipId is required" }, { status: 400 });

    const fees = await prisma.championshipFee.findMany({ where: { championshipId }, orderBy: { createdAt: "asc" } });
    return NextResponse.json({ fees });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const input = championshipFeeSchema.parse(body);
    const ctx = await requireChampionshipAccess(input.championshipId, ["TOURNAMENT_ADMIN"]);

    const fee = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "championship_fees",
      mutate: (tx) =>
        tx.championshipFee.create({
          data: {
            championshipId: input.championshipId,
            name: input.name,
            description: input.description ?? null,
            amountKes: input.amountKes,
            isRequired: input.isRequired,
          },
        }),
      recordId: (result) => result.id,
      newData: input,
    });

    return NextResponse.json({ fee }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
