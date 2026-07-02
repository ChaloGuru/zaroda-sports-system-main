import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireAuth, isSuperAdmin, toErrorResponse, AuthorizationError } from "@/lib/authorize";
import { adminMessageSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requireAuth();

    const messages = await prisma.adminMessage.findMany({
      where: { OR: [{ recipientId: ctx.userId }, { senderId: ctx.userId }, { isBroadcast: true }] },
      orderBy: { createdAt: "desc" },
      include: { sender: { select: { name: true, email: true } }, recipient: { select: { name: true, email: true } } },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = adminMessageSchema.parse(body);

    if (input.isBroadcast && !isSuperAdmin(ctx)) {
      throw new AuthorizationError("Only a super admin can send a broadcast message");
    }
    if (!input.isBroadcast && !input.recipientId) {
      throw new Error("recipientId is required for a direct message");
    }

    const message = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "admin_messages",
      mutate: (tx) =>
        tx.adminMessage.create({
          data: {
            senderId: ctx.userId,
            recipientId: input.recipientId ?? null,
            parentId: input.parentId ?? null,
            subject: input.subject,
            body: input.body,
            isBroadcast: input.isBroadcast,
          },
        }),
      recordId: (result) => result.id,
      newData: input,
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
