import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, toErrorResponse } from "@/lib/authorize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requireAuth();
    const notifications = await prisma.notification.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ notifications });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

const markReadSchema = z.object({ id: z.string().uuid(), isRead: z.boolean() });

export async function PATCH(request: Request) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = markReadSchema.parse(body);

    const notification = await prisma.notification.findUnique({ where: { id: input.id } });
    if (!notification || notification.userId !== ctx.userId) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    const updated = await prisma.notification.update({ where: { id: input.id }, data: { isRead: input.isRead } });
    return NextResponse.json({ notification: updated });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
