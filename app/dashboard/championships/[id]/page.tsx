import { notFound, redirect } from "next/navigation";
import { getAuthContext, isSuperAdmin, hasRole, CHAMPIONSHIP_OPERATIONAL_ROLES } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { ChampionshipManager } from "@/components/dashboard/championship-manager";

export default async function DashboardChampionshipDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

  // Officials' roles end a day after the championship does (see
  // isChampionshipRoleActive in lib/authorize.ts); say so plainly instead of
  // showing panels that can no longer load. The organiser keeps access.
  const rolesEndAt = new Date(championship.endDate);
  rolesEndAt.setDate(rolesEndAt.getDate() + 1);
  if (!isFullAdmin && new Date() >= rolesEndAt) {
    return (
      <div className="mx-auto max-w-lg space-y-3 py-16 text-center">
        <h1 className="text-2xl font-bold text-foreground">{championship.name}</h1>
        <p className="text-muted">
          This championship ended on {formatDate(championship.endDate)}, so your role in it has ended too. The organiser
          can still make changes - contact them if something needs correcting.
        </p>
        {championship.isPublished && (
          <p>
            <Link href={`/championship/${championship.id}`} className="text-primary hover:underline">
              View the published results
            </Link>
          </p>
        )}
      </div>
    );
  }

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
      level={championship.level}
      county={championship.county}
      isPublished={championship.isPublished}
      restrictToOrganizationName={teamManagerRole?.organizationName ?? null}
      isSuperAdmin={isSuperAdmin(ctx)}
    />
  );
}
