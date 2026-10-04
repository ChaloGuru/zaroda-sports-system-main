import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { AuthorizationError, toErrorResponse } from "@/lib/authorize";
import { escapeHtml as escape, sendEmail } from "@/lib/email";
import { getEditableEdition, requireKsefAdmin } from "@/lib/ksef";
import { ksefRegistrationDecisionSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

/**
 * Decides a pending school registration:
 * - APPROVE: accepts the school it registered as (added to the edition), or -
 *   with schoolId - links it to a school already on record, moving its
 *   projects there and discarding the duplicate row it created.
 * - REJECT: discards its draft projects and the school row it created.
 * The contact is told by email either way (best effort).
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await requireKsefAdmin();
    const input = ksefRegistrationDecisionSchema.parse(await request.json());
    const registration = await prisma.ksefSchoolRegistration.findUnique({ where: { id: params.id } });
    if (!registration) throw new AuthorizationError("Registration not found", 404);
    const edition = await getEditableEdition(registration.editionId);
    if (registration.status !== "PENDING") throw new Error("This registration has already been decided");
    const ownSchoolId = registration.schoolId;

    if (input.action === "APPROVE") {
      const targetSchoolId = input.schoolId ?? ownSchoolId;
      if (!targetSchoolId) throw new Error("This registration has no school to approve");
      if (input.schoolId && input.schoolId !== ownSchoolId) {
        const target = await prisma.school.findUnique({ where: { id: input.schoolId }, select: { id: true } });
        if (!target) throw new AuthorizationError("School not found", 404);
      }

      await withAudit({
        actorId: ctx.userId,
        operation: "UPDATE",
        tableName: "ksef_school_registrations",
        oldData: { status: registration.status, schoolId: ownSchoolId },
        mutate: async (tx) => {
          if (targetSchoolId !== ownSchoolId) {
            await tx.ksefProject.updateMany({ where: { registrationId: registration.id }, data: { schoolId: targetSchoolId } });
          }
          const updated = await tx.ksefSchoolRegistration.update({
            where: { id: registration.id },
            data: { status: "APPROVED", schoolId: targetSchoolId, reviewedById: ctx.userId, reviewedAt: new Date() },
          });
          await tx.ksefEditionSchool.upsert({
            where: { editionId_schoolId: { editionId: registration.editionId, schoolId: targetSchoolId } },
            create: { editionId: registration.editionId, schoolId: targetSchoolId },
            update: {},
          });
          // The row created at sign-up is only a duplicate once linked elsewhere.
          if (ownSchoolId && targetSchoolId !== ownSchoolId) await deleteSignupSchool(tx, ownSchoolId);
          return updated;
        },
        recordId: (result) => result.id,
        newData: { status: "APPROVED", schoolId: targetSchoolId, linkedToExisting: targetSchoolId !== ownSchoolId },
      });

      await sendEmail({
        to: registration.contactEmail,
        subject: `${registration.schoolName} is approved for ${edition.name}`,
        html: `<p>Hello ${escape(registration.contactName)},</p><p><strong>${escape(registration.schoolName)}</strong> has been approved for <strong>${escape(edition.name)}</strong>. Keep using your school's private link to enter or update projects until registration closes.</p><p>Zaroda Sports</p>`,
        text: `Hello ${registration.contactName},\n\n${registration.schoolName} has been approved for ${edition.name}. Keep using your school's private link to enter or update projects until registration closes.\n\nZaroda Sports`,
      });
      return NextResponse.json({ status: "APPROVED" });
    }

    await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "ksef_school_registrations",
      oldData: { status: registration.status, schoolId: ownSchoolId },
      mutate: async (tx) => {
        const submitted = await tx.ksefProject.count({ where: { registrationId: registration.id, status: { not: "DRAFT" } } });
        if (submitted > 0) throw new Error("This school already has projects in the competition - withdraw them first");
        await tx.ksefProject.deleteMany({ where: { registrationId: registration.id } });
        const updated = await tx.ksefSchoolRegistration.update({
          where: { id: registration.id },
          data: { status: "REJECTED", rejectionReason: input.reason, schoolId: null, reviewedById: ctx.userId, reviewedAt: new Date() },
        });
        if (ownSchoolId) await deleteSignupSchool(tx, ownSchoolId);
        return updated;
      },
      recordId: (result) => result.id,
      newData: { status: "REJECTED", reason: input.reason },
    });

    await sendEmail({
      to: registration.contactEmail,
      subject: `Your ${edition.name} registration for ${registration.schoolName}`,
      html: `<p>Hello ${escape(registration.contactName)},</p><p>The registration of <strong>${escape(registration.schoolName)}</strong> for <strong>${escape(edition.name)}</strong> was not accepted.</p><p>Reason: ${escape(input.reason)}</p><p>Contact the KSEF administrator if you have questions.</p><p>Zaroda Sports</p>`,
      text: `Hello ${registration.contactName},\n\nThe registration of ${registration.schoolName} for ${edition.name} was not accepted.\n\nReason: ${input.reason}\n\nContact the KSEF administrator if you have questions.\n\nZaroda Sports`,
    });
    return NextResponse.json({ status: "REJECTED" });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * Removes the school row a registration created at sign-up - but only if
 * nothing else has come to use it (a championship, another fair, projects).
 */
async function deleteSignupSchool(tx: Prisma.TransactionClient, schoolId: string) {
  const school = await tx.school.findUnique({
    where: { id: schoolId },
    select: {
      _count: { select: { ksefProjects: true, ksefEditions: true, championships: true, participants: true, teams: true, bibRanges: true } },
    },
  });
  if (school && Object.values(school._count).every((n) => n === 0)) await tx.school.delete({ where: { id: schoolId } });
}
