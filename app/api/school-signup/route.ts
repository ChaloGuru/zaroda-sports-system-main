import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { schoolSignupSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { toErrorResponse } from "@/lib/authorize";
import { regionOfCounty } from "@/lib/kenya-counties";

export const dynamic = "force-dynamic";

const CODE_TAKEN = "This KNEC code has already been used to sign up a school";

/** A school signs itself up with its KNEC code, which can only ever be used once. */
export async function POST(request: Request) {
  try {
    const limit = await rateLimit(`school-signup:${getClientIp(request)}`, 10, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many attempts. Please try again shortly." }, { status: 429 });
    }

    const input = schoolSignupSchema.parse(await request.json());
    const email = input.email.toLowerCase().trim();

    const [codeTaken, emailTaken] = await Promise.all([
      prisma.schoolAccount.findUnique({ where: { knecCode: input.knecCode }, select: { id: true } }),
      prisma.user.findUnique({ where: { email }, select: { id: true } }),
    ]);
    if (codeTaken) return NextResponse.json({ error: CODE_TAKEN }, { status: 409 });
    if (emailTaken) return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });

    const passwordHash = await bcrypt.hash(input.password, 12);

    try {
      const account = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { email, passwordHash, name: input.contactName, phone: input.phone } });
        const created = await tx.schoolAccount.create({
          data: {
            knecCode: input.knecCode,
            schoolName: input.schoolName,
            baseName: input.baseName,
            zone: input.zone,
            subcounty: input.subcounty,
            county: input.county,
            region: regionOfCounty(input.county) ?? "",
            userId: user.id,
          },
        });
        await tx.auditLog.create({
          data: {
            changedBy: user.id,
            operation: "INSERT",
            tableName: "school_accounts",
            recordId: created.id,
            newData: { knecCode: created.knecCode, schoolName: created.schoolName, county: created.county },
          },
        });
        return created;
      });
      return NextResponse.json({ schoolAccountId: account.id }, { status: 201 });
    } catch (error) {
      // Two signups at the same moment: the database's unique rule decides.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const fields = (error.meta?.target as string[] | string | undefined) ?? "";
        const isCode = String(fields).includes("knecCode");
        return NextResponse.json({ error: isCode ? CODE_TAKEN : "An account with this email already exists" }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
