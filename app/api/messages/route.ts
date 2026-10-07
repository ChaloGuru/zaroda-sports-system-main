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

    // A reply joins a conversation the sender is part of: a message sent to
    // or by them, or a broadcast.
    const parent = input.parentId
      ? await prisma.adminMessage.findUnique({
          where: { id: input.parentId },
          select: { senderId: true, recipientId: true, isBroadcast: true },
        })
      : null;
    if (input.parentId && (!parent || !(parent.isBroadcast || parent.senderId === ctx.userId || parent.recipientId === ctx.userId))) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Only a super admin starts conversations or picks who to write to;
    // anyone else can only reply, and the reply goes to whoever wrote to them.
    let recipientId = input.recipientId ?? null;
    if (!input.isBroadcast && !isSuperAdmin(ctx)) {
      if (!parent || parent.senderId === ctx.userId) {
        throw new AuthorizationError("You can only reply to messages sent to you");
      }
      recipientId = parent.senderId;
    }
    if (!input.isBroadcast && !recipientId) {
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
            recipientId,
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
