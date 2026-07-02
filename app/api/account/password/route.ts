import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireAuth, toErrorResponse } from "@/lib/authorize";
import { changePasswordSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

/** Self-service password change for the currently logged-in user. */
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = changePasswordSchema.parse(body);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    const isValid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    // newData intentionally omits the hash - audit log entries are readable
    // via the admin audit trail and must never contain password material.
    await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "users",
      mutate: (tx) => tx.user.update({ where: { id: ctx.userId }, data: { passwordHash } }),
      recordId: (result) => result.id,
      newData: { passwordChanged: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
