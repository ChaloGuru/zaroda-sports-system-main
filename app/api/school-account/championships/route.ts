import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { AuthorizationError, assertWithinGeographicScope, isGeographicallyRestricted, requireAuth, toErrorResponse } from "@/lib/authorize";
import { createSchoolEntries } from "@/lib/championship-schools";
import { isInJurisdiction } from "@/lib/jurisdiction";
import { schoolEntryLevels } from "@/lib/school-levels";

export const dynamic = "force-dynamic";

const pushSchema = z.object({ championshipId: z.string().uuid() });

async function requireSchoolAccount() {
  const ctx = await requireAuth();
  const account = await prisma.schoolAccount.findUnique({ where: { userId: ctx.userId } });
  if (!account) throw new AuthorizationError("Only a signed-up school can do this");
  return { ctx, account };
}

const nameIs = (name: string) => ({ equals: name, mode: "insensitive" as const });

/** The Inter School championships in a school's jurisdiction, and those it has pushed to. */
export async function GET() {
  try {
    const { account } = await requireSchoolAccount();
    const links = await prisma.championshipSchool.findMany({ where: { schoolAccountId: account.id }, select: { championshipId: true } });
    const pushed = new Set(links.map((l) => l.championshipId));

    const championships = await prisma.championship.findMany({
      where: {
        isPublished: true,
        endDate: { gte: new Date() },
        OR: [
          {
            level: "BASE",
            county: nameIs(account.county),
            OR: [{ jurisdiction: null }, { jurisdiction: nameIs(account.baseName) }],
          },
          { id: { in: Array.from(pushed) } },
        ],
      },
      orderBy: { startDate: "asc" },
      take: 200,
      select: { id: true, name: true, level: true, category: true, county: true, startDate: true, registrationClosesAt: true },
    });

    return NextResponse.json({
      school: { name: account.schoolName, knecCode: account.knecCode, baseName: account.baseName, county: account.county },
      championships: championships.map((c) => ({ ...c, joined: pushed.has(c.id) })),
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * A school pushes itself to the Inter School championship in its jurisdiction:
 * it goes on the school list and can register its learners there. Its account
 * stays at school level - the championship's team managers are signed up by
 * the admin like other officials, and learners move higher by promotion.
 */
export async function POST(request: Request) {
  try {
    const { ctx, account } = await requireSchoolAccount();
    const { championshipId } = pushSchema.parse(await request.json());

    const championship = await prisma.championship.findUnique({
      where: { id: championshipId },
      select: { id: true, level: true, county: true, jurisdiction: true, schoolLevel: true, isPublished: true, endDate: true, registrationClosesAt: true },
    });
    if (!championship || !championship.isPublished || championship.level === "OPEN_TOURNAMENT") {
      return NextResponse.json({ error: "Championship not found" }, { status: 404 });
    }
    if (championship.level !== "BASE") {
      throw new AuthorizationError("Schools push to Inter School only - above that, learners move up by promotion");
    }
    if (championship.endDate < new Date()) {
      return NextResponse.json({ error: "This championship has ended" }, { status: 400 });
    }
    if (!isInJurisdiction(account, championship)) {
      throw new AuthorizationError("This championship is outside your school's jurisdiction");
    }
    if (isGeographicallyRestricted(championship.level)) {
      assertWithinGeographicScope(championship.county, account.county);
    }

    const listed = await prisma.championshipSchool.findMany({
      where: { championshipId, school: { name: nameIs(account.schoolName) } },
      select: { id: true, schoolId: true, schoolAccountId: true, school: { select: { schoolLevel: true } } },
    });
    if (listed.some((l) => l.schoolAccountId && l.schoolAccountId !== account.id)) {
      return NextResponse.json(
        { error: `Another school account already holds ${account.schoolName} here - ask the tournament admin to sort this out` },
        { status: 409 },
      );
    }
    if (listed.some((l) => l.schoolAccountId === account.id)) return NextResponse.json({ joined: true });
    if (championship.registrationClosesAt && championship.registrationClosesAt <= new Date()) {
      return NextResponse.json({ error: "Registration for this championship has closed" }, { status: 400 });
    }

    const area = { county: account.county, subcounty: account.subcounty, zone: account.zone, region: account.region };
    const have = new Set(listed.map((l) => l.school.schoolLevel));
    const missing = schoolEntryLevels(championship.schoolLevel).filter((level) => !have.has(level));

    await withAudit({
      actorId: ctx.userId,
      operation: "INSERT",
      tableName: "championship_schools",
      mutate: async (tx) => {
        // An admin may already have typed the school in - the account takes those entries over.
        if (listed.length > 0) {
          await tx.championshipSchool.updateMany({ where: { id: { in: listed.map((l) => l.id) } }, data: { schoolAccountId: account.id } });
          await tx.school.updateMany({ where: { id: { in: listed.map((l) => l.schoolId) } }, data: area });
        }
        if (missing.length > 0) {
          await createSchoolEntries(
            tx,
            championshipId,
            missing.map((schoolLevel) => ({ name: account.schoolName, schoolLevel })),
            area,
            account.id,
          );
        }
        return { id: championshipId };
      },
      recordId: (result) => result.id,
      newData: { championshipId, schoolName: account.schoolName, knecCode: account.knecCode },
    });

    return NextResponse.json({ joined: true }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
