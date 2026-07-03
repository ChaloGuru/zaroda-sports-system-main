import { notFound, redirect } from "next/navigation";
import { getAuthContext, isSuperAdmin, hasRole, CHAMPIONSHIP_OPERATIONAL_ROLES } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { ChampionshipManager } from "@/components/dashboard/championship-manager";

export default async function DashboardChampionshipDetailPage({ params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const championship = await prisma.championship.findUnique({ where: { id: params.id } });
  if (!championship) notFound();

  const scopedRoles = ctx.roles.filter(
    (r) => r.championshipId === championship.id && CHAMPIONSHIP_OPERATIONAL_ROLES.includes(r.role),
  );
  const isFullAdmin = isSuperAdmin(ctx) || (hasRole(ctx, "TENANT_OWNER") && ctx.tenantId === championship.tenantId);
  const owns = isFullAdmin || scopedRoles.length > 0;
  if (!owns) notFound();

  // A user whose ONLY role here is Team Manager gets a cut-down view scoped
  // to just their own organization's teams - not the full admin surface
  // (Settings, Fixtures, Bib Ranges, other teams, etc).
  const teamManagerRole = !isFullAdmin && scopedRoles.every((r) => r.role === "TEAM_MANAGER")
    ? scopedRoles.find((r) => r.role === "TEAM_MANAGER")
    : undefined;

  return (
    <ChampionshipManager
      championshipId={championship.id}
      name={championship.name}
      category={championship.category}
      schoolLevel={championship.schoolLevel}
      isPublished={championship.isPublished}
      restrictToOrganizationName={teamManagerRole?.organizationName ?? null}
    />
  );
}
