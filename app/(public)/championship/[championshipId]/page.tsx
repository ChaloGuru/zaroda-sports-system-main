import { notFound } from "next/navigation";
import Image from "next/image";
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
      circulars: { orderBy: { createdAt: "desc" }, include: { postedBy: { select: { name: true } } } },
    },
  });

  if (!championship || !championship.isPublished) notFound();

  // A registered organization gets one TournamentTeam row per game it enters
  // (see the bulk "Add organizations" flow in TeamsPanel), so the raw list
  // here can have the same org appearing a dozen-plus times. The public
  // "Teams / Schools" tab is a roster of participating organizations, not a
  // per-game entry list, so it's deduplicated by name before rendering.
  const uniqueTeams = Array.from(
    championship.tournamentTeams
      .reduce((byName, team) => {
        const key = team.name.trim().toLowerCase();
        if (!byName.has(key)) byName.set(key, team);
        return byName;
      }, new Map<string, (typeof championship.tournamentTeams)[number]>())
      .values(),
  ).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="relative">
      <div className="fixed inset-0 -z-10">
        <Image src="/images/team-bg.png" alt="" fill priority sizes="100vw" className="object-cover object-top" />
        <div className="absolute inset-0 bg-[#0A1633]/85" />
      </div>

      <div className="container py-16">
        <div className="rounded-xl border border-white/10 bg-background/95 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
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
            championshipName={championship.name}
            games={championship.games.map((g) => ({
              id: g.id,
              name: g.name,
              category: g.category,
              gender: g.gender,
              schoolLevel: g.schoolLevel,
              isTimed: g.isTimed,
            }))}
            teams={uniqueTeams.map((t) => ({ id: t.id, name: t.name, teamCode: t.teamCode }))}
            circulars={championship.circulars.map((c) => ({
              id: c.id,
              title: c.title,
              body: c.body,
              createdAt: c.createdAt.toISOString(),
              postedByName: c.postedBy.name,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
