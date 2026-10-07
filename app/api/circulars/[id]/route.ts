import { NextResponse } from "next/server";
import DOMPurify from "isomorphic-dompurify";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { requireRole, toErrorResponse } from "@/lib/authorize";
import { circularSchema } from "@/lib/validations";
import { revalidatePath } from "next/cache";
import { deleteCircularFile } from "@/lib/circular-files";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await requireRole(["SUPER_ADMIN"]);
    const existing = await prisma.circular.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Circular not found" }, { status: 404 });

    const body: unknown = await request.json();
    const input = circularSchema.partial().parse(body);
    const data = { ...input, content: input.content ? DOMPurify.sanitize(input.content) : undefined };

    const updated = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "circulars",
      oldData: existing,
      mutate: (tx) => tx.circular.update({ where: { id: params.id }, data }),
      recordId: () => params.id,
      newData: data,
    });

    // A replaced or removed attachment no longer needs storing.
    if (input.documentUrl !== undefined && input.documentUrl !== existing.documentUrl) await deleteCircularFile(existing.documentUrl);
    revalidatePath("/circulars");
    return NextResponse.json({ circular: updated });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await requireRole(["SUPER_ADMIN"]);
    const existing = await prisma.circular.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Circular not found" }, { status: 404 });

    await withAudit({
      actorId: ctx.userId,
      operation: "DELETE",
      tableName: "circulars",
      oldData: existing,
      mutate: (tx) => tx.circular.delete({ where: { id: params.id } }),
      recordId: () => params.id,
    });
    await deleteCircularFile(existing.documentUrl);
    revalidatePath("/circulars");

    return NextResponse.json({ success: true });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
