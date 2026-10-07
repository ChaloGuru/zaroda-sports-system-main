import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { findSetupUser } from "@/lib/account-setup";
import { AuthorizationError, toErrorResponse } from "@/lib/authorize";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { passwordSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

const INVALID_LINK = "This link isn't valid any more - it may have been used already or expired. Ask whoever added you for help.";

const setupSchema = z
  .object({
    token: z.string().min(1),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

async function limited(request: Request) {
  return !(await rateLimit(`account-setup:${getClientIp(request)}`, 20, 10 * 60_000)).allowed;
}

/** Public: who an account setup link is for. */
export async function GET(request: Request) {
  try {
    if (await limited(request)) return NextResponse.json({ error: "Too many attempts - try again in a few minutes" }, { status: 429 });
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const user = await findSetupUser(token);
    if (!user) return NextResponse.json({ error: INVALID_LINK }, { status: 410 });
    return NextResponse.json({ email: user.email, name: user.name });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/** Public: set the password for an account added through Roles. Works once per link. */
export async function POST(request: Request) {
  try {
    if (await limited(request)) return NextResponse.json({ error: "Too many attempts - try again in a few minutes" }, { status: 429 });
    const input = setupSchema.parse(await request.json());
    const user = await findSetupUser(input.token);
    if (!user) throw new AuthorizationError(INVALID_LINK, 410);

    const passwordHash = await bcrypt.hash(input.password, 12);
    await prisma.$transaction(async (tx) => {
      // Conditional on the hash the link was checked against, so two
      // submissions of the same link can't both succeed.
      const updated = await tx.user.updateMany({
        where: { id: user.id, passwordHash: user.passwordHash },
        data: { passwordHash },
      });
      if (updated.count !== 1) throw new AuthorizationError(INVALID_LINK, 410);
      await tx.auditLog.create({
        data: { changedBy: user.id, operation: "UPDATE", tableName: "users", recordId: user.id, newData: { accountSetUp: true } },
      });
    });

    return NextResponse.json({ email: user.email });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
