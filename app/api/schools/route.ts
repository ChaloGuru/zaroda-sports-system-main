import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, toErrorResponse } from "@/lib/authorize";

export const dynamic = "force-dynamic";

const schoolCreateSchema = z.object({
  name: z.string().min(2).max(200),
  zone: z.string().min(1).max(100),
  subcounty: z.string().min(1).max(100),
  county: z.string().min(1).max(100),
  region: z.string().min(1).max(100),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    const county = searchParams.get("county");

    const schools = await prisma.school.findMany({
      where: {
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
        ...(county ? { county } : {}),
      },
      orderBy: { name: "asc" },
      take: 200,
    });

    return NextResponse.json({ schools });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  try {
    await requireAuth();
    const body: unknown = await request.json();
    const input = schoolCreateSchema.parse(body);

    const school = await prisma.school.create({ data: input });
    return NextResponse.json({ school }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
