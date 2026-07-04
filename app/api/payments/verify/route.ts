import { NextResponse } from "next/server";
import { verifyAndRecordPayment } from "@/lib/payment-verification";
import { paymentVerifySchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference");
  console.log(`[verify][GET] called with reference: ${reference ?? "(missing)"}`);
  if (!reference) return NextResponse.json({ error: "reference is required" }, { status: 400 });

  try {
    const result = await verifyAndRecordPayment(reference);
    console.log(`[verify][GET] reference ${reference} -> success=${result.success} message=${result.message}`);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error(`[verify][GET] reference ${reference} threw:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verification failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const { reference } = paymentVerifySchema.parse(body);
    console.log(`[verify][POST] called with reference: ${reference}`);
    const result = await verifyAndRecordPayment(reference);
    console.log(`[verify][POST] reference ${reference} -> success=${result.success} message=${result.message}`);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error("[verify][POST] threw:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verification failed" },
      { status: 500 },
    );
  }
}
