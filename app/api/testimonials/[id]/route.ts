import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireAuth, requireRole, isSuperAdmin, toErrorResponse, AuthorizationError } from "@/lib/authorize";
import { testimonialStatusSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

// Feature / archive / restore - super admin only.
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await requireRole(["SUPER_ADMIN"]);
    const body: unknown = await request.json();
    const input = testimonialStatusSchema.parse(body);

    const existing = await prisma.testimonial.findUnique({ where: { id: params.id } });
    if (!existing) throw new AuthorizationError("Testimonial not found", 404);

    const testimonial = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "testimonials",
      mutate: (tx) => tx.testimonial.update({ where: { id: params.id }, data: { status: input.status } }),
      recordId: (result) => result.id,
      oldData: { status: existing.status },
      newData: input,
    });

    return NextResponse.json({ testimonial });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

// The super admin can delete any testimonial; anyone else only their own
// (retracting what they wrote).
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await requireAuth();
    const existing = await prisma.testimonial.findUnique({ where: { id: params.id } });
    if (!existing || (!isSuperAdmin(ctx) && existing.userId !== ctx.userId)) {
      throw new AuthorizationError("Testimonial not found", 404);
    }

    await withAudit({
      actorId: ctx.userId,
      operation: "DELETE",
      tableName: "testimonials",
      mutate: (tx) => tx.testimonial.delete({ where: { id: params.id } }),
      recordId: (result) => result.id,
      oldData: existing,
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
