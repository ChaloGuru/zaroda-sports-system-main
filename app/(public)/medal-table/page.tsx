"use client";

import * as React from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { Medal } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LaneChip } from "@/components/ui/lane-chip";
import { FinishLineRule } from "@/components/ui/finish-line-rule";
import { PanelErrorBoundary } from "@/components/error-boundary";
import { apiGet } from "@/lib/api-client";

interface ChampionshipOption {
  id: string;
  name: string;
}

interface MedalRow {
  schoolId: string;
  schoolName: string;
  gold: number;
  silver: number;
  bronze: number;
  total: number;
  position: number;
}

function MedalTableExplorer() {
  const [championshipId, setChampionshipId] = React.useState<string>("");

  const { data: championships } = useQuery({
    queryKey: ["championships-public"],
    queryFn: () => apiGet<{ championships: ChampionshipOption[] }>("/api/championships"),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["medal-table", championshipId],
    queryFn: () => apiGet<{ medalTable: MedalRow[] }>(`/api/medal-table?championshipId=${championshipId}`),
    enabled: !!championshipId,
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

      {!championshipId && <p className="text-muted">Select a championship to view its medal table.</p>}
      {championshipId && isLoading && <p className="text-muted">Loading medal table...</p>}

      {championshipId && !isLoading && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Medal className="h-5 w-5 text-[#C99A2E]" /> Medal Table
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Institution</TableHead>
                  <TableHead>Gold</TableHead>
                  <TableHead>Silver</TableHead>
                  <TableHead>Bronze</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.medalTable ?? []).map((row) => (
                  <TableRow key={row.schoolId}>
                    <TableCell>
                      <LaneChip value={row.position} rank={row.position} />
                    </TableCell>
                    <TableCell className="font-medium">{row.schoolName}</TableCell>
                    <TableCell className="font-mono tabular-nums text-[#C99A2E]">{row.gold}</TableCell>
                    <TableCell className="font-mono tabular-nums text-[#8A93A3]">{row.silver}</TableCell>
                    <TableCell className="font-mono tabular-nums text-[#A9682F]">{row.bronze}</TableCell>
                    <TableCell className="font-mono text-base font-bold tabular-nums text-primary">{row.total}</TableCell>
                  </TableRow>
                ))}
                {(data?.medalTable ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted">
                      No medals recorded yet for this championship.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function MedalTablePage() {
  return (
    <div>
      <section className="relative flex h-56 items-end overflow-hidden sm:h-64">
        <Image src="/images/hero.png" alt="" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(100deg,#0A1633,rgba(10,22,51,0.7),rgba(10,22,51,0.35))]" />
        <div className="container relative pb-8">
          <h1 className="font-heading text-3xl font-extrabold text-white sm:text-4xl">Medal Table</h1>
          <p className="mt-2 max-w-xl text-white/80">Gold, silver, and bronze counts by institution.</p>
        </div>
        <FinishLineRule className="absolute inset-x-0 bottom-0" />
      </section>

      <div className="container py-16">
        <PanelErrorBoundary fallbackTitle="Medal table failed to load">
          <MedalTableExplorer />
        </PanelErrorBoundary>
      </div>
    </div>
  );
}
