import { notFound, redirect } from "next/navigation";
import { getAuthContext, isSuperAdmin, hasRole } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { ChampionshipManager } from "@/components/dashboard/championship-manager";

export default async function DashboardChampionshipDetailPage({ params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const championship = await prisma.championship.findUnique({ where: { id: params.id } });
  if (!championship) notFound();

  const scopedToChampionship = ctx.roles.some(
    (r) =>
      r.championshipId === championship.id &&
      (r.role === "TOURNAMENT_ADMIN" || r.role === "SCOREKEEPER" || r.role === "OFFICIAL"),
  );
  const owns =
    isSuperAdmin(ctx) ||
    (hasRole(ctx, "TENANT_OWNER") && ctx.tenantId === championship.tenantId) ||
    scopedToChampionship;
  if (!owns) notFound();

  return (
    <ChampionshipManager
      championshipId={championship.id}
      name={championship.name}
      category={championship.category}
      isPublished={championship.isPublished}
    />
  );
}
