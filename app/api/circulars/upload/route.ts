import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireRole, toErrorResponse } from "@/lib/authorize";

export const dynamic = "force-dynamic";

// Vercel refuses request bodies over 4.5 MB before they reach this code.
const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB

export async function POST(request: Request) {
  try {
    await requireRole(["SUPER_ADMIN"]);

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file was uploaded" }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF files are allowed" }, { status: 400 });
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "PDF must be smaller than 4 MB - compress it or split it into parts" }, { status: 400 });
    }

    // Files go to Vercel Blob. Connecting a store to the project in Vercel
    // gives the SDK its credentials - either BLOB_READ_WRITE_TOKEN or
    // BLOB_STORE_ID with Vercel's automatic OIDC token.
    const blob = await put(`circulars/${Date.now()}-${file.name}`, file, {
      access: "public",
      // Unguessable URL - without it the path is just a timestamp and filename.
      addRandomSuffix: true,
      contentType: "application/pdf",
    });

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    if (error instanceof Error && /No blob credentials/i.test(error.message)) {
      return NextResponse.json(
        { error: "File storage isn't set up yet - connect a Blob store to this project in Vercel (Storage tab), then redeploy." },
        { status: 503 },
      );
    }
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
