"use client";

import * as React from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FinishLineRule } from "@/components/ui/finish-line-rule";
import { PanelErrorBoundary } from "@/components/error-boundary";
import { StandingsPanel } from "@/components/championship/standings-panel";
import { apiGet } from "@/lib/api-client";

interface ChampionshipOption {
  id: string;
  name: string;
}

function RankingsExplorer() {
  const [championshipId, setChampionshipId] = React.useState<string>("");

  const { data: championships } = useQuery({
    queryKey: ["championships-public"],
    queryFn: () => apiGet<{ championships: ChampionshipOption[] }>("/api/championships"),
  });

  return (
    <div className="space-y-6">
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

      {!championshipId && <p className="text-muted">Select a championship to view its standings.</p>}
      {championshipId && <StandingsPanel championshipId={championshipId} />}
    </div>
  );
}

export default function RankingsPage() {
  return (
    <div>
      <section className="relative flex h-56 items-end overflow-hidden sm:h-64">
        <Image src="/images/hero.png" alt="" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(100deg,#0A1633,rgba(10,22,51,0.7),rgba(10,22,51,0.35))]" />
        <div className="container relative pb-8">
          <h1 className="font-heading text-3xl font-extrabold text-white sm:text-4xl">Rankings</h1>
          <p className="mt-2 max-w-xl text-white/80">County/regional-style standings, filterable by school level.</p>
        </div>
        <FinishLineRule className="absolute inset-x-0 bottom-0" />
      </section>

      <div className="container py-16">
        <PanelErrorBoundary fallbackTitle="Rankings failed to load">
          <RankingsExplorer />
        </PanelErrorBoundary>
      </div>
    </div>
  );
}
