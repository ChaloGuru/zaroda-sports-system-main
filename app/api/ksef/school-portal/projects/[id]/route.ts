import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthorizationError, toErrorResponse } from "@/lib/authorize";
import { assertPortalWritable, requirePortalRegistration } from "@/lib/ksef-registration";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { ksefPortalProjectSchema } from "@/lib/validations";
import { portalProjectData, replacePeople } from "../shared";

export const dynamic = "force-dynamic";

/** A draft project this registration entered itself - never anyone else's, and never once submitted. */
async function loadOwnDraft(request: Request, projectId: string) {
  if (!rateLimit(`ksef-portal-write:${getClientIp(request)}`, 60, 10 * 60_000).allowed) {
    throw new AuthorizationError("Too many requests - try again in a few minutes", 429);
  }
  const registration = await requirePortalRegistration(request);
  assertPortalWritable(registration);
  const project = await prisma.ksefProject.findUnique({ where: { id: projectId } });
  if (!project || project.registrationId !== registration.id) throw new AuthorizationError("Project not found", 404);
  if (project.status !== "DRAFT") {
    throw new AuthorizationError("This project has been accepted into the competition and can no longer be changed here", 409);
  }
  return { registration, project };
}

/** School portal: replace a draft project's details, learners and mentors. */
export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { registration, project } = await loadOwnDraft(request, params.id);
    const data = await portalProjectData(registration, ksefPortalProjectSchema.parse(await request.json()));

    await prisma.$transaction(async (tx) => {
      // Conditional on still being a draft, in case the administrator
      // submitted it while the school was editing.
      const updated = await tx.ksefProject.updateMany({ where: { id: project.id, status: "DRAFT" }, data: data.fields });
      if (updated.count !== 1) throw new AuthorizationError("This project has just been accepted into the competition and can no longer be changed here", 409);
      await replacePeople(tx, project.id, data);
      await tx.auditLog.create({
        data: { changedBy: null, operation: "UPDATE", tableName: "ksef_projects", recordId: project.id, newData: { ...data.fields, viaRegistration: registration.id } },
      });
    });
    return NextResponse.json({ saved: true });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/** School portal: remove a draft project the school entered. */
export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { registration, project } = await loadOwnDraft(request, params.id);
    await prisma.$transaction(async (tx) => {
      const deleted = await tx.ksefProject.deleteMany({ where: { id: project.id, status: "DRAFT" } });
      if (deleted.count !== 1) throw new AuthorizationError("This project can no longer be removed here", 409);
      await tx.auditLog.create({
        data: { changedBy: null, operation: "DELETE", tableName: "ksef_projects", recordId: project.id, oldData: { title: project.title, viaRegistration: registration.id } },
      });
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
