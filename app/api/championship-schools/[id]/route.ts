import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import {
  requireChampionshipAccess,
  isGeographicallyRestricted,
  assertWithinGeographicScope,
  toErrorResponse,
} from "@/lib/authorize";
import { championshipSchoolUpdateSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

/** Renames a school on a championship's list (e.g. a typo) or corrects its county. */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const link = await prisma.championshipSchool.findUnique({
      where: { id: params.id },
      include: { school: true, championship: { select: { county: true, level: true } } },
    });
    if (!link) return NextResponse.json({ error: "School not found in this championship" }, { status: 404 });

    const ctx = await requireChampionshipAccess(link.championshipId, ["TOURNAMENT_ADMIN"]);
    const body: unknown = await request.json();
    const input = championshipSchoolUpdateSchema.parse(body);

    if (input.county && isGeographicallyRestricted(link.championship.level)) {
      assertWithinGeographicScope(link.championship.county, input.county);
    }
    // In a Primary/JS championship a school is two entries (Primary + JS)
    // sharing one name - rename/re-county them together so they stay paired.
    const siblings = await prisma.championshipSchool.findMany({
      where: {
        championshipId: link.championshipId,
        school: { name: { equals: link.school.name.trim(), mode: "insensitive" } },
      },
      select: { id: true, schoolId: true },
    });
    const siblingSchoolIds = siblings.map((s) => s.schoolId);

    if (input.name && input.name.toLowerCase() !== link.school.name.trim().toLowerCase()) {
      const clash = await prisma.championshipSchool.findFirst({
        where: {
          championshipId: link.championshipId,
          id: { notIn: siblings.map((s) => s.id) },
          school: { name: { equals: input.name, mode: "insensitive" } },
        },
      });
      if (clash) return NextResponse.json({ error: "Another school on this list already has that name" }, { status: 409 });
    }

    const updated = await withAudit({
      actorId: ctx.userId,
      operation: "UPDATE",
      tableName: "schools",
      oldData: link.school,
      mutate: (tx) => tx.school.updateMany({ where: { id: { in: siblingSchoolIds } }, data: input }),
      recordId: () => link.schoolId,
      newData: { ...input, schoolIds: siblingSchoolIds },
    });

    return NextResponse.json({ updated: updated.count });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * Removes a school from a championship's list, along with its bib range
 * there. Refused while the championship still has participants from that
 * school, so no athlete is left pointing at a school that isn't on the list.
 */
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const link = await prisma.championshipSchool.findUnique({ where: { id: params.id }, include: { school: true } });
    if (!link) return NextResponse.json({ error: "School not found in this championship" }, { status: 404 });

    const ctx = await requireChampionshipAccess(link.championshipId, ["TOURNAMENT_ADMIN"]);

    const participants = await prisma.participant.count({
      where: { championshipId: link.championshipId, schoolId: link.schoolId },
    });
    if (participants > 0) {
      return NextResponse.json(
        {
          error: `${link.school.name} still has ${participants} participant${participants === 1 ? "" : "s"} in this championship - remove or move them first.`,
        },
        { status: 409 },
      );
    }

    await withAudit({
      actorId: ctx.userId,
      operation: "DELETE",
      tableName: "championship_schools",
      oldData: { link, school: link.school },
      mutate: async (tx) => {
        await tx.schoolBibRange.deleteMany({ where: { championshipId: link.championshipId, schoolId: link.schoolId } });
        await tx.championshipSchool.delete({ where: { id: link.id } });
        // Drop the School row itself once nothing else uses it (it may still
        // be linked to another championship, e.g. after a promotion).
        const stillUsed =
          (await tx.championshipSchool.count({ where: { schoolId: link.schoolId } })) +
          (await tx.participant.count({ where: { schoolId: link.schoolId } })) +
          (await tx.schoolBibRange.count({ where: { schoolId: link.schoolId } }));
        if (stillUsed === 0) await tx.school.delete({ where: { id: link.schoolId } });
        return link.id;
      },
      recordId: () => link.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
