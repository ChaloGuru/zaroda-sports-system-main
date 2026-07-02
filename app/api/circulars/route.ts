import { NextResponse } from "next/server";
import DOMPurify from "isomorphic-dompurify";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireRole, toErrorResponse } from "@/lib/authorize";
import { circularSchema, levelSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetLevelParam = levelSchema.safeParse(searchParams.get("targetLevel"));
    const targetLevel = targetLevelParam.success ? targetLevelParam.data : undefined;

    const circulars = await prisma.circular.findMany({
      where: { isPublished: true, ...(targetLevel ? { targetLevel } : {}) },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ circulars });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole(["SUPER_ADMIN"]);
    const body: unknown = await request.json();
    const input = circularSchema.parse(body);

    const circular = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "circulars",
      mutate: (tx) =>
        tx.circular.create({
          data: {
            title: input.title,
            content: DOMPurify.sanitize(input.content),
            senderName: input.senderName,
            senderRole: input.senderRole,
            targetLevel: input.targetLevel,
            isPublished: input.isPublished,
            documentUrl: input.documentUrl ?? null,
          },
        }),
      recordId: (result) => result.id,
      newData: input,
    });

    return NextResponse.json({ circular }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
