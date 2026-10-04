import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthorizationError, toErrorResponse } from "@/lib/authorize";
import { sendEmail } from "@/lib/email";
import { KENYA_COUNTIES } from "@/lib/kenya-counties";
import { regionForCounty } from "@/lib/ksef-config";
import { isRegistrationOpen, newPortalToken, portalEmail, portalUrl } from "@/lib/ksef-registration";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { ksefSchoolRegistrationSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

const NOT_FOUND = "This registration link isn't valid. Check you copied all of it, or ask the KSEF administrator for the current one.";

async function findOpenEdition(token: string) {
  const edition = token ? await prisma.ksefEdition.findUnique({ where: { registrationToken: token } }) : null;
  if (!edition) throw new AuthorizationError(NOT_FOUND, 404);
  return edition;
}

/** Public: which fair an open registration link is for, and whether it's still accepting schools. */
export async function GET(request: Request) {
  try {
    if (!rateLimit(`ksef-register-view:${getClientIp(request)}`, 60, 10 * 60_000).allowed) {
      return NextResponse.json({ error: "Too many attempts - try again in a few minutes" }, { status: 429 });
    }
    const edition = await findOpenEdition(new URL(request.url).searchParams.get("token") ?? "");
    return NextResponse.json({
      editionName: edition.name,
      year: edition.year,
      closesAt: edition.registrationClosesAt,
      isOpen: isRegistrationOpen(edition),
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * Public: register a school, or re-send a school's private link. Either way
 * the private link only ever goes to the contact email - never back in this
 * response - so registering proves the contact owns that address. The
 * response is the same whether or not the email had registered before.
 */
export async function POST(request: Request) {
  try {
    if (!rateLimit(`ksef-register:${getClientIp(request)}`, 5, 10 * 60_000).allowed) {
      return NextResponse.json({ error: "Too many attempts - try again in a few minutes" }, { status: 429 });
    }
    const input = ksefSchoolRegistrationSchema.parse(await request.json());
    const edition = await findOpenEdition(input.token);
    if (!isRegistrationOpen(edition)) throw new AuthorizationError(`Registration for ${edition.name} is closed`, 410);
    const county = KENYA_COUNTIES.find((c) => c.name.toLowerCase() === input.county.toLowerCase())?.name;
    if (!county) throw new Error("Choose your county from the list");

    const { token, tokenHash } = newPortalToken();
    const existing = await prisma.ksefSchoolRegistration.findUnique({
      where: { editionId_contactEmail: { editionId: edition.id, contactEmail: input.contactEmail } },
    });

    let registration;
    let created = false;
    if (existing) {
      if (existing.status === "REJECTED") {
        throw new AuthorizationError("A registration from this email wasn't accepted. Contact the KSEF administrator if you think this is a mistake.", 409);
      }
      // A fresh link replaces the old one, so a forwarded or lost link stops working.
      registration = await prisma.ksefSchoolRegistration.update({ where: { id: existing.id }, data: { tokenHash } });
    } else {
      registration = await prisma.$transaction(async (tx) => {
        // The school's own row from the start, so its projects have a school
        // to belong to - hidden from the administrator's school search until
        // approved, and replaced if it's linked to an existing school.
        const school = await tx.school.create({
          data: {
            name: input.schoolName,
            county,
            subcounty: input.subcounty,
            zone: input.zone || input.subcounty,
            region: regionForCounty(county),
          },
        });
        const row = await tx.ksefSchoolRegistration.create({
          data: {
            editionId: edition.id,
            schoolId: school.id,
            schoolName: input.schoolName,
            county,
            subcounty: input.subcounty,
            zone: input.zone ?? null,
            contactName: input.contactName,
            contactEmail: input.contactEmail,
            contactPhone: input.contactPhone ?? null,
            tokenHash,
          },
        });
        await tx.auditLog.create({
          data: {
            changedBy: null,
            operation: "INSERT",
            tableName: "ksef_school_registrations",
            recordId: row.id,
            newData: { schoolName: input.schoolName, county, subcounty: input.subcounty, contactEmail: input.contactEmail },
          },
        });
        return row;
      });
      created = true;
    }

    const email = await sendEmail({
      to: registration.contactEmail,
      ...portalEmail({
        contactName: registration.contactName,
        schoolName: registration.schoolName,
        editionName: edition.name,
        url: portalUrl(token),
      }),
    });
    if (!email.sent) {
      if (created) {
        await prisma.ksefSchoolRegistration.delete({ where: { id: registration.id } });
        if (registration.schoolId) await prisma.school.delete({ where: { id: registration.schoolId } }).catch(() => undefined);
      }
      throw new Error("We couldn't send your school's link by email right now. Please try again later.");
    }

    return NextResponse.json({ emailed: true, email: registration.contactEmail });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
