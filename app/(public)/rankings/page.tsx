"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Calendar } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FinishLineRule } from "@/components/ui/finish-line-rule";
import { PanelErrorBoundary } from "@/components/error-boundary";
import { StandingsPanel } from "@/components/championship/standings-panel";
import { apiGet } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";

interface ChampionshipOption {
  id: string;
  name: string;
}

interface OngoingChampionship {
  id: string;
  name: string;
  level: string;
  schoolLevel: string;
  location: string;
  county: string;
  startDate: string;
  endDate: string;
  tenant: { organizationName: string };
}

function RankingsExplorer() {
  const [championshipId, setChampionshipId] = React.useState<string>("");

  const { data: championships } = useQuery({
    queryKey: ["championships-public"],
    queryFn: () => apiGet<{ championships: ChampionshipOption[] }>("/api/championships"),
  });
  const { data: ongoingData } = useQuery({
    queryKey: ["championships-public-ongoing"],
    queryFn: () => apiGet<{ championships: OngoingChampionship[] }>("/api/championships?ongoing=true"),
  });
  const { data: upcomingData } = useQuery({
    queryKey: ["championships-public-upcoming"],
    queryFn: () => apiGet<{ championships: OngoingChampionship[] }>("/api/championships?upcoming=true"),
  });
  const ongoingChampionships = ongoingData?.championships ?? [];
  const upcomingChampionships = upcomingData?.championships ?? [];
  const selected = (championships?.championships ?? []).find((c) => c.id === championshipId);

  return (
    <div className="space-y-6">
      {!championshipId && ongoingChampionships.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-extrabold text-foreground">Ongoing Championships</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {ongoingChampionships.map((c) => (
              <button key={c.id} type="button" onClick={() => setChampionshipId(c.id)} className="text-left">
                <Card className="h-full border-2 border-primary/40 transition-colors hover:border-primary">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">{c.level.replace("_", " ")}</Badge>
                      <Badge variant="outline">{c.schoolLevel.replace("_", " ")}</Badge>
                    </div>
                    <CardTitle className="mt-2 font-extrabold">{c.name}</CardTitle>
                    <CardDescription className="font-semibold">{c.tenant.organizationName}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm font-medium text-foreground">
                    <p className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" /> {c.location}, {c.county}
                    </p>
                    <p className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" /> {formatDate(c.startDate)} - {formatDate(c.endDate)}
                    </p>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        </div>
      )}

      {!championshipId && upcomingChampionships.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-extrabold text-foreground">Upcoming Championships</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {upcomingChampionships.slice(0, 6).map((c) => (
              <button key={c.id} type="button" onClick={() => setChampionshipId(c.id)} className="text-left">
                <Card className="h-full border-2 border-accent/40 transition-colors hover:border-accent">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">{c.level.replace("_", " ")}</Badge>
                      <Badge variant="outline">{c.schoolLevel.replace("_", " ")}</Badge>
                    </div>
                    <CardTitle className="mt-2 font-extrabold">{c.name}</CardTitle>
                    <CardDescription className="font-semibold">{c.tenant.organizationName}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm font-medium text-foreground">
                    <p className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" /> {c.location}, {c.county}
                    </p>
                    <p className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" /> {formatDate(c.startDate)} - {formatDate(c.endDate)}
                    </p>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Select value={championshipId} onValueChange={setChampionshipId}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Choose a championship" />
          </SelectTrigger>
          <SelectContent>
            {(championships?.championships ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!championshipId && <p className="text-muted">Select a championship to view its standings.</p>}
      {championshipId && selected && <StandingsPanel championshipId={championshipId} championshipName={selected.name} />}
    </div>
  );
}

export default function RankingsPage() {
  return (
    <div className="relative">
      <div className="fixed inset-0 -z-10">
        <Image src="/images/team-bg.png" alt="" fill priority sizes="100vw" className="object-cover object-top" />
        <div className="absolute inset-0 bg-[#0A1633]/85" />
      </div>

      <section className="relative flex h-56 items-end overflow-hidden sm:h-64">
        <div className="container relative pb-8">
          <h1 className="font-heading text-3xl font-extrabold text-white sm:text-4xl">Rankings</h1>
          <p className="mt-2 max-w-xl text-white/80">County/regional-style standings, filterable by school level.</p>
        </div>
        <FinishLineRule className="absolute inset-x-0 bottom-0" />
      </section>

      <div className="container py-16">
        <div className="rounded-xl border border-white/10 bg-background/95 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
          <PanelErrorBoundary fallbackTitle="Rankings failed to load">
            <RankingsExplorer />
          </PanelErrorBoundary>
        </div>
      </div>
    </div>
  );
}
