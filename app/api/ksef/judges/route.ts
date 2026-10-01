import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { toErrorResponse } from "@/lib/authorize";
import { getEditableEdition, requireKsefAdmin } from "@/lib/ksef";
import { ksefJudgeSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireKsefAdmin();
    const editionId = new URL(request.url).searchParams.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId is required" }, { status: 400 });

    const judges = await prisma.ksefJudge.findMany({
      where: { editionId },
      orderBy: { user: { name: "asc" } },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        assignments: { select: { id: true, level: true, submittedAt: true } },
      },
    });
    return NextResponse.json({
      judges: judges.map(({ assignments, ...j }) => ({
        ...j,
        assignedCount: assignments.length,
        submittedCount: assignments.filter((a) => a.submittedAt).length,
      })),
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * Adds a judge to the edition's panel. An existing Zaroda account (matched
 * by email) is reused; otherwise a new account is created with the given
 * name and password - the same way championship officials are added.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireKsefAdmin();
    const input = ksefJudgeSchema.parse(await request.json());
    await getEditableEdition(input.editionId);

    const email = input.email.toLowerCase().trim();
    let user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) {
      if (!input.name || !input.password) {
        throw new Error("No account uses that email yet - enter the judge's name and a password to create one");
      }
      user = await prisma.user.create({
        data: { email, name: input.name, phone: input.phone || null, passwordHash: await bcrypt.hash(input.password, 12) },
        select: { id: true },
      });
    }

    const already = await prisma.ksefJudge.findUnique({
      where: { editionId_userId: { editionId: input.editionId, userId: user.id } },
      select: { id: true },
    });
    if (already) throw new Error("That person is already on this edition's judging panel");

    const judge = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "ksef_judges",
      mutate: (tx) =>
        tx.ksefJudge.create({ data: { editionId: input.editionId, userId: user.id, specialty: input.specialty ?? null } }),
      recordId: (result) => result.id,
      // Never persist password material in the audit trail.
      newData: { ...input, password: undefined },
    });
    return NextResponse.json({ judge }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
