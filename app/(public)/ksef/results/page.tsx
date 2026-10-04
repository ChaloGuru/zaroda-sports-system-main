"use client";

import * as React from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical, Search } from "lucide-react";
import type { KsefDivision, Level } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LaneChip } from "@/components/ui/lane-chip";
import { FinishLineRule } from "@/components/ui/finish-line-rule";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { PanelErrorBoundary } from "@/components/error-boundary";
import { apiGet } from "@/lib/api-client";
import { KSEF_DIVISION_LABELS, KSEF_DIVISIONS } from "@/lib/ksef-config";
import { LEVEL_LABELS } from "@/lib/utils";

interface PublishedEdition {
  id: string;
  name: string;
  year: number;
  levels: Level[];
}

interface PublicResult {
  id: string;
  code: string | null;
  title: string;
  learners: string[];
  school: string;
  unit: string;
  category: { id: string; name: string; division: KsefDivision; sortOrder: number };
  subCategory: string | null;
  totalScore: number | null;
  rank: number | null;
  qualified: boolean;
}

interface CategoryGroup {
  key: string;
  unit: string;
  category: PublicResult["category"];
  rows: PublicResult[];
}

/** One table per area + category, ranked - the way KSEF results are announced. */
function groupResults(results: PublicResult[]): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>();
  for (const r of results) {
    const key = `${r.unit}\u0000${r.category.id}`;
    const group = groups.get(key) ?? { key, unit: r.unit, category: r.category, rows: [] };
    group.rows.push(r);
    groups.set(key, group);
  }
  const divisionOrder = (d: KsefDivision) => KSEF_DIVISIONS.indexOf(d);
  return Array.from(groups.values())
    .map((g) => ({ ...g, rows: g.rows.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity)) }))
    .sort(
      (a, b) =>
        a.unit.localeCompare(b.unit) ||
        divisionOrder(a.category.division) - divisionOrder(b.category.division) ||
        a.category.sortOrder - b.category.sortOrder ||
        a.category.name.localeCompare(b.category.name),
    );
}

function ResultsExplorer() {
  const [editionId, setEditionId] = React.useState("");
  const [level, setLevel] = React.useState<Level | "">("");
  const [division, setDivision] = React.useState<KsefDivision | "ALL">("ALL");
  const [search, setSearch] = React.useState("");

  const { data: editionsData, isLoading: editionsLoading } = useQuery({
    queryKey: ["ksef-public-editions"],
    queryFn: () => apiGet<{ editions: PublishedEdition[] }>("/api/ksef/public-results"),
  });
  const editions = editionsData?.editions ?? [];
  const edition = editions.find((e) => e.id === editionId);

  // Default to the latest edition and its highest published level.
  React.useEffect(() => {
    if (!editionId && editions[0]) setEditionId(editions[0].id);
  }, [editionId, editions]);
  React.useEffect(() => {
    if (edition && (!level || !edition.levels.includes(level))) setLevel(edition.levels[edition.levels.length - 1] ?? "");
  }, [edition, level]);

  const { data, isLoading } = useQuery({
    queryKey: ["ksef-public-results", editionId, level],
    queryFn: () => apiGet<{ results: PublicResult[] }>(`/api/ksef/public-results?editionId=${editionId}&level=${level}`),
    enabled: !!editionId && !!level,
  });

  const groups = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = (data?.results ?? []).filter(
      (r) =>
        (division === "ALL" || r.category.division === division) &&
        (!term ||
          [r.title, r.school, r.unit, r.code ?? "", r.category.name, ...r.learners].some((field) => field.toLowerCase().includes(term))),
    );
    return groupResults(filtered);
  }, [data, division, search]);

  if (editionsLoading) return <p className="text-muted">Loading results...</p>;
  if (editions.length === 0) {
    return <p className="text-muted">No KSEF results have been published yet. Check back once judging is complete.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={editionId} onValueChange={setEditionId}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Choose a fair" />
          </SelectTrigger>
          <SelectContent>
            {editions.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={level} onValueChange={(v) => setLevel(v as Level)}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            {(edition?.levels ?? []).map((l) => (
              <SelectItem key={l} value={l}>
                {LEVEL_LABELS[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={division} onValueChange={(v) => setDivision(v as KsefDivision | "ALL")}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All divisions</SelectItem>
            {KSEF_DIVISIONS.map((d) => (
              <SelectItem key={d} value={d}>
                {KSEF_DIVISION_LABELS[d]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search school, learner, project or area"
          />
        </div>
      </div>

      {isLoading && <p className="text-muted">Loading results...</p>}
      {!isLoading && groups.length === 0 && <p className="text-muted">No published results match your filters.</p>}

      {groups.map((group) => (
        <Card key={group.key}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
              <FlaskConical className="h-5 w-5 text-primary" />
              {group.category.name}
              <Badge variant="secondary">{KSEF_DIVISION_LABELS[group.category.division]}</Badge>
              <span className="text-sm font-normal text-muted">{group.unit}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Learners</TableHead>
                  <TableHead>School</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.rank !== null ? <LaneChip value={r.rank} rank={r.rank} /> : <span className="text-muted">-</span>}</TableCell>
                    <TableCell className="min-w-48">
                      <div className="font-medium text-foreground">{r.title}</div>
                      <div className="text-xs text-muted">
                        {[r.code, r.subCategory].filter(Boolean).join(" · ")}
                      </div>
                    </TableCell>
                    <TableCell className="min-w-40">{r.learners.join(", ") || "-"}</TableCell>
                    <TableCell className="min-w-40">{r.school}</TableCell>
                    <TableCell className="text-right font-mono text-base font-bold tabular-nums text-primary">
                      {r.totalScore !== null ? r.totalScore.toFixed(2) : "-"}
                    </TableCell>
                    <TableCell>{r.qualified && <Badge variant="success">Qualified</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function KsefResultsPage() {
  return (
    <div>
      <section className="relative flex h-56 items-end overflow-hidden sm:h-64">
        <Image src="/images/hero.png" alt="" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(100deg,#0A1633,rgba(10,22,51,0.7),rgba(10,22,51,0.35))]" />
        <div className="container relative pb-8">
          <h1 className="font-heading text-3xl font-extrabold text-white sm:text-4xl">KSEF Results</h1>
          <p className="mt-2 max-w-xl text-white/80">
            Published Kenya Science and Engineering Fair results, ranked by category at each level.
          </p>
        </div>
        <FinishLineRule className="absolute inset-x-0 bottom-0" />
      </section>

      <div className="container py-16">
        <PanelErrorBoundary fallbackTitle="KSEF results failed to load">
          <ResultsExplorer />
        </PanelErrorBoundary>
      </div>
    </div>
  );
}
