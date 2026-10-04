import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/authorize";
import { assertPortalWritable, requirePortalRegistration } from "@/lib/ksef-registration";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { ksefPortalProjectSchema } from "@/lib/validations";
import { portalProjectData, replacePeople } from "./shared";

export const dynamic = "force-dynamic";

/** School portal: enter a new project (a draft until the administrator submits it). */
export async function POST(request: Request) {
  try {
    if (!rateLimit(`ksef-portal-write:${getClientIp(request)}`, 60, 10 * 60_000).allowed) {
      return NextResponse.json({ error: "Too many requests - try again in a few minutes" }, { status: 429 });
    }
    const registration = await requirePortalRegistration(request);
    assertPortalWritable(registration);
    if (!registration.schoolId) throw new Error("This registration has no school to enter projects under");
    const data = await portalProjectData(registration, ksefPortalProjectSchema.parse(await request.json()));

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.ksefProject.create({
        data: { ...data.fields, editionId: registration.editionId, schoolId: registration.schoolId!, registrationId: registration.id },
      });
      await replacePeople(tx, created.id, data);
      await tx.auditLog.create({
        data: { changedBy: null, operation: "INSERT", tableName: "ksef_projects", recordId: created.id, newData: { ...data.fields, viaRegistration: registration.id } },
      });
      return created;
    });
    return NextResponse.json({ project: { id: project.id } }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
