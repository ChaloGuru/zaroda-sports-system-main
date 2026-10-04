import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/authorize";
import { assertPortalWritable, requirePortalRegistration } from "@/lib/ksef-registration";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * School portal (private link): the school's registration, the edition's
 * categories to enter, and the projects this registration has entered.
 */
export async function GET(request: Request) {
  try {
    if (!rateLimit(`ksef-portal:${getClientIp(request)}`, 120, 10 * 60_000).allowed) {
      return NextResponse.json({ error: "Too many requests - try again in a few minutes" }, { status: 429 });
    }
    const registration = await requirePortalRegistration(request);
    let writable = true;
    try {
      assertPortalWritable(registration);
    } catch {
      writable = false;
    }

    const [categories, projects] = await Promise.all([
      prisma.ksefCategory.findMany({
        where: {
          editionId: registration.editionId,
          isActive: true,
          ...(registration.divisions.length > 0 ? { division: { in: registration.divisions } } : {}),
        },
        orderBy: [{ division: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          division: true,
          subCategories: { where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } },
        },
      }),
      prisma.ksefProject.findMany({
        where: { registrationId: registration.id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          code: true,
          status: true,
          title: true,
          abstract: true,
          documentUrl: true,
          categoryId: true,
          subCategoryId: true,
          learners: { orderBy: { createdAt: "asc" }, select: { firstName: true, lastName: true, gender: true, grade: true, upiNumber: true } },
          mentors: { orderBy: { createdAt: "asc" }, select: { name: true, tscNumber: true, phone: true, email: true } },
        },
      }),
    ]);

    return NextResponse.json({
      registration: {
        schoolName: registration.schoolName,
        county: registration.county,
        subcounty: registration.subcounty,
        divisions: registration.divisions,
        contactName: registration.contactName,
        contactEmail: registration.contactEmail,
        status: registration.status,
        rejectionReason: registration.rejectionReason,
      },
      edition: { name: registration.edition.name, closesAt: registration.edition.registrationClosesAt },
      writable,
      categories,
      projects,
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
