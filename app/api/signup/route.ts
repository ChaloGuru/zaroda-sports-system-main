import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signupSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const limit = rateLimit(`signup:${ip}`, 10, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many attempts. Please try again shortly." }, { status: 429 });
    }

    const body: unknown = await request.json();
    const input = signupSchema.parse(body);
    const email = input.email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    const tenant = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          name: input.contactName,
          roles: { create: { role: "TENANT_OWNER" } },
        },
      });

      const createdTenant = await tx.tenant.create({
        data: {
          organizationName: input.organizationName,
          contactName: input.contactName,
          email,
          phone: input.phone,
          accountType: input.accountType,
          county: input.county,
          subcounty: input.subcounty,
          gameCategory: input.gameCategory,
          userId: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          changedBy: user.id,
          operation: "INSERT",
          tableName: "tenants",
          recordId: createdTenant.id,
          newData: { organizationName: createdTenant.organizationName, accountType: createdTenant.accountType },
        },
      });

      return createdTenant;
    });

    return NextResponse.json({ tenantId: tenant.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Signup failed" },
      { status: 400 },
    );
  }
}
