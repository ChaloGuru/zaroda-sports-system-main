import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { toErrorResponse } from "@/lib/authorize";
import { requireKsefAdmin } from "@/lib/ksef";

export const dynamic = "force-dynamic";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// Project report/write-up upload - same Blob storage as circular PDFs.
export async function POST(request: Request) {
  try {
    await requireKsefAdmin();

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
