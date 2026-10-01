import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { AuthorizationError, isSuperAdmin, requireAuth, toErrorResponse } from "@/lib/authorize";

export const dynamic = "force-dynamic";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// Scan of a written complaint - for the KSEF administrator and members of
// any non-closed edition's panel (the people who can record complaints).
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!isSuperAdmin(ctx)) {
      const member = await prisma.ksefJudge.count({
        where: { userId: ctx.userId, isActive: true, edition: { status: { not: "CLOSED" } } },
      });
      if (member === 0) throw new AuthorizationError("Only KSEF panel members can attach complaint documents");
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file was uploaded" }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF files are allowed" }, { status: 400 });
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "PDF must be smaller than 10 MB" }, { status: 400 });
    }

    const blob = await put(`ksef-complaints/${Date.now()}-${file.name}`, file, {
      access: "public",
      contentType: "application/pdf",
    });
    return NextResponse.json({ url: blob.url });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
