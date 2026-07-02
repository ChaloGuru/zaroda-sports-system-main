import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { contactFormSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Public contact form. Rate-limited by IP; stored as an unrouted
 * AdminMessage-style broadcast is unnecessary here so we log it via the
 * AuditLog table (no dedicated ContactSubmission model in the schema) for
 * super admins to review.
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const limit = rateLimit(`contact:${ip}`, 5, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many submissions. Please try again in a minute." }, { status: 429 });
    }

    const body: unknown = await request.json();
    const input = contactFormSchema.parse(body);

    await prisma.auditLog.create({
      data: {
        changedBy: null,
        operation: "INSERT",
        tableName: "contact_submissions",
        recordId: crypto.randomUUID(),
        newData: input,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit contact form" },
      { status: 400 },
    );
  }
}
