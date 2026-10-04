import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { toErrorResponse } from "@/lib/authorize";
import { assertPortalWritable, requirePortalRegistration } from "@/lib/ksef-registration";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// School portal: a project write-up PDF - same storage as the administrator's uploads.
export async function POST(request: Request) {
  try {
    if (!rateLimit(`ksef-portal-upload:${getClientIp(request)}`, 20, 10 * 60_000).allowed) {
      return NextResponse.json({ error: "Too many uploads - try again in a few minutes" }, { status: 429 });
    }
    const registration = await requirePortalRegistration(request);
    assertPortalWritable(registration);

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

    const blob = await put(`ksef-projects/${Date.now()}-${file.name}`, file, {
      access: "public",
      // Unguessable URL - without it the path is just a timestamp and filename.
      addRandomSuffix: true,
      contentType: "application/pdf",
    });
    return NextResponse.json({ url: blob.url });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
