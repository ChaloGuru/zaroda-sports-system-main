import { notFound } from "next/navigation";
import { MapPin, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ChampionshipTabs } from "@/components/championship/championship-tabs";
import { ResultsActions } from "@/components/championship/results-actions";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export const revalidate = 30;

export default async function ChampionshipPage({ params }: { params: { championshipId: string } }) {
  const championship = await prisma.championship.findUnique({
    where: { id: params.championshipId },
    include: {
      tenant: { select: { organizationName: true } },
      games: { orderBy: { name: "asc" } },
      tournamentTeams: { orderBy: { name: "asc" } },
    },
  });

  if (!championship || !championship.isPublished) notFound();

  return (
    <div className="container py-16">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{championship.level.replace("_", " ")}</Badge>
        <Badge variant="secondary">{championship.schoolLevel.replace("_", " ")}</Badge>
        <Badge variant="outline">{championship.category.replace("_", " ")}</Badge>
      </div>
      <h1 className="mt-4 text-3xl font-bold text-foreground">{championship.name}</h1>
      <p className="mt-1 text-muted">Organized by {championship.tenant.organizationName}</p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-6 text-sm text-muted">
          <span className="flex items-center gap-2">
            <MapPin className="h-4 w-4" /> {championship.location}, {championship.county}
          </span>
          <span className="flex items-center gap-2">
            <Calendar className="h-4 w-4" /> {formatDate(championship.startDate)} - {formatDate(championship.endDate)}
          </span>
        </div>
        <ResultsActions championshipId={championship.id} championshipName={championship.name} />
      </div>

      <ChampionshipTabs
        championshipId={championship.id}
        games={championship.games.map((g) => ({
          id: g.id,
          name: g.name,
          category: g.category,
          gender: g.gender,
          schoolLevel: g.schoolLevel,
          isTimed: g.isTimed,
        }))}
        teams={championship.tournamentTeams.map((t) => ({ id: t.id, name: t.name, teamCode: t.teamCode }))}
      />
    </div>
  );
}
