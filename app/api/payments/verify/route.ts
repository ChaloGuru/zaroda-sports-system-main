import { NextResponse } from "next/server";
import { verifyAndRecordPayment } from "@/lib/payment-verification";
import { paymentVerifySchema } from "@/lib/validations";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference");
  if (!reference) return NextResponse.json({ error: "reference is required" }, { status: 400 });

  try {
    const result = await verifyAndRecordPayment(reference);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
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
    const result = await verifyAndRecordPayment(reference);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verification failed" },
      { status: 500 },
    );
  }
}
