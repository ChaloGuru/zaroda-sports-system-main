import { NextResponse } from "next/server";
import type { TestimonialStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireAuth, requireRole, isSuperAdmin, toErrorResponse, AuthorizationError } from "@/lib/authorize";
import { testimonialSchema } from "@/lib/validations";
import { championshipsRunByTenant, testimonialAuthor } from "@/lib/testimonials";

export const dynamic = "force-dynamic";

const STATUSES: TestimonialStatus[] = ["SUBMITTED", "FEATURED", "ARCHIVED"];

// Platform-wide list, super admin only. Archived testimonials are hidden
// unless explicitly requested (?status=ARCHIVED or ?status=ALL) - that's the
// point of archiving one.
export async function GET(request: Request) {
  try {
    await requireRole(["SUPER_ADMIN"]);
    const statusParam = new URL(request.url).searchParams.get("status");
    const status = STATUSES.find((s) => s === statusParam);

    const testimonials = await prisma.testimonial.findMany({
      where: status ? { status } : statusParam === "ALL" ? {} : { status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "desc" },
    });
    const championshipsRun = await championshipsRunByTenant(testimonials.map((t) => t.tenantId));

    return NextResponse.json({
      testimonials: testimonials.map((t) => ({
        ...t,
        championshipsRun: t.tenantId ? (championshipsRun.get(t.tenantId) ?? 0) : 0,
      })),
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

// Any signed-in user (other than the platform owner) can submit one
// testimonial about their own experience.
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (isSuperAdmin(ctx)) throw new AuthorizationError("The platform owner can't submit a testimonial");
    const body: unknown = await request.json();
    const input = testimonialSchema.parse(body);

    const existing = await prisma.testimonial.findUnique({ where: { userId: ctx.userId }, select: { id: true } });
    if (existing) throw new Error("You've already submitted a testimonial - delete it first to write a new one");

    const author = await testimonialAuthor(ctx);
    const testimonial = await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "testimonials",
      mutate: (tx) =>
        tx.testimonial.create({
          data: {
            userId: ctx.userId,
            tenantId: ctx.tenantId,
            ...author,
            message: input.message,
            rating: input.rating ?? null,
            allowPublicUse: input.allowPublicUse,
          },
        }),
      recordId: (result) => result.id,
      newData: input,
    });

    return NextResponse.json({ testimonial }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
