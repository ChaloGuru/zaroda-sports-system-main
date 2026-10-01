import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthorizationError, isSuperAdmin, requireAuth, toErrorResponse } from "@/lib/authorize";
import { getPanelMember } from "@/lib/ksef";

export const dynamic = "force-dynamic";

// ?editionId= -> the edition's submitted/withdrawn projects and the levels
// each competed at - just enough to pick one when recording a complaint.
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const editionId = new URL(request.url).searchParams.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId is required" }, { status: 400 });
    if (!isSuperAdmin(ctx) && !(await getPanelMember(ctx.userId, editionId))) {
      throw new AuthorizationError("You're not on this edition's panel");
    }

    const projects = await prisma.ksefProject.findMany({
      where: { editionId, status: { not: "DRAFT" } },
      orderBy: { code: "asc" },
      select: { id: true, code: true, title: true, school: { select: { name: true } }, results: { select: { level: true } } },
    });
    return NextResponse.json({
      projects: projects.map(({ results, ...p }) => ({ ...p, levels: results.map((r) => r.level) })),
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
