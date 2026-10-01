"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowUpRight, Calculator, Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet, apiPost } from "@/lib/api-client";
import { KSEF_DIVISIONS, KSEF_DIVISION_LABELS, nextKsefLevel } from "@/lib/ksef-config";
import { LEVEL_LABELS } from "@/lib/utils";
import type { LevelResultRow } from "./judges-manager";
import type { KsefEditionSummary } from "./types";
import type { Level } from "@prisma/client";

const STATUS_BADGE = { PENDING: "outline", QUALIFIED: "success", NOT_QUALIFIED: "secondary" } as const;
const STATUS_LABEL = { PENDING: "pending", QUALIFIED: "qualified", NOT_QUALIFIED: "not qualified" } as const;

export function ResultsManager({ edition }: { edition: KsefEditionSummary }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const readOnly = edition.status === "CLOSED";
  const [level, setLevel] = React.useState<Level>(edition.currentLevel);
  const [division, setDivision] = React.useState("ALL");
  const next = nextKsefLevel(edition.levels, level);

  const { data, isLoading } = useQuery({
    queryKey: ["ksef-results", edition.id, level],
    queryFn: () => apiGet<{ results: LevelResultRow[] }>(`/api/ksef/results?editionId=${edition.id}&level=${level}`),
  });

  const actionMutation = useMutation({
    mutationFn: (action: "CALCULATE" | "PUBLISH" | "PROGRESS") =>
      apiPost<{ calculated?: number; published?: number; progressed?: number; nextLevel?: Level }>("/api/ksef/results", {
        editionId: edition.id,
        level,
        action,
      }),
    onSuccess: (result, action) => {
      if (action === "CALCULATE") toast.success(`Scores and ranks recalculated for ${result.calculated} projects`);
      if (action === "PUBLISH") toast.success(`${LEVEL_LABELS[level]} results published`);
      if (action === "PROGRESS" && result.nextLevel) {
        toast.success(`${result.progressed} projects progressed to ${LEVEL_LABELS[result.nextLevel]}`);
        setLevel(result.nextLevel);
        router.refresh();
      }
      queryClient.invalidateQueries({ queryKey: ["ksef-results", edition.id] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Action failed"),
  });

  const results = (data?.results ?? []).filter(
    (r) => r.project.status === "SUBMITTED" && (division === "ALL" || r.project.category.division === division),
  );
  const published = results.length > 0 && results.every((r) => r.isPublished);
  const qualifiedCount = results.filter((r) => r.status === "QUALIFIED").length;
  const unscored = results.filter((r) => r.submittedJudges === 0).length;
  const openReviews = (data?.results ?? []).filter((r) => r.project.status === "SUBMITTED" && r.review?.status === "OPEN").length;

  // Group by geographic unit, then category - the groups projects are ranked in.
  const groups = new Map<string, LevelResultRow[]>();
  for (const r of results) {
    const key = `${r.unit} — ${r.project.category.name} (${KSEF_DIVISION_LABELS[r.project.category.division]})`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Calculate, publish and progress</CardTitle>
          <CardDescription>
            A project&apos;s score is the average of its judges&apos; submitted totals, or the final result a Chief Judge
            approved after a discrepancy review. Projects are ranked within their{" "}
            {level === "NATIONAL" ? "category nationally" : `category in each ${LEVEL_LABELS[level].toLowerCase()}`}; the top{" "}
            {edition.qualifiersPerCategory} per group qualify{next ? ` for ${LEVEL_LABELS[next]}` : ""} when results are published.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {edition.discrepancyThreshold === null && (
            <p className="w-full rounded-md border border-[#B45309]/40 bg-[#FBF2DC] p-3 text-sm text-[#8A6412]">
              The judging discrepancy threshold isn&apos;t set for {edition.name}. Enter it from this year&apos;s KSEF rules in
              Competitions → Settings - results can&apos;t be published until it is.
            </p>
          )}
          {openReviews > 0 && (
            <p className="w-full rounded-md border border-[#B45309]/40 bg-[#FBF2DC] p-3 text-sm text-[#8A6412]">
              ⚠️ {openReviews} project{openReviews === 1 ? " has" : "s have"} a judging discrepancy awaiting Chief Judge review at{" "}
              {LEVEL_LABELS[level]}. Results can&apos;t be published until {openReviews === 1 ? "it is" : "they are"} approved.
            </p>
          )}
          <Select value={level} onValueChange={(v) => setLevel(v as Level)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {edition.levels.map((l) => (
                <SelectItem key={l} value={l}>
                  {LEVEL_LABELS[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" disabled={readOnly || actionMutation.isPending} onClick={() => actionMutation.mutate("CALCULATE")}>
            <Calculator className="h-4 w-4" /> Calculate scores
          </Button>
          <Button
            disabled={readOnly || actionMutation.isPending || results.length === 0}
            onClick={() =>
              confirm(
                `${published ? "Re-publish" : "Publish"} ${LEVEL_LABELS[level]} results?${unscored > 0 ? `\n\n${unscored} project(s) have no submitted score sheet and won't be ranked.` : ""}`,
              ) && actionMutation.mutate("PUBLISH")
            }
          >
            <Megaphone className="h-4 w-4" /> {published ? "Re-publish results" : "Publish results"}
          </Button>
          {next && (
            <Button
              variant="secondary"
              disabled={readOnly || actionMutation.isPending || !published || qualifiedCount === 0}
              onClick={() =>
                confirm(`Progress ${qualifiedCount} qualified project(s) to ${LEVEL_LABELS[next]}? This also makes ${LEVEL_LABELS[next]} the current level.`) &&
                actionMutation.mutate("PROGRESS")
              }
            >
              <ArrowUpRight className="h-4 w-4" /> Progress qualifiers to {LEVEL_LABELS[next]}
            </Button>
          )}
          <Select value={division} onValueChange={setDivision}>
            <SelectTrigger className="ml-auto w-44">
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
        </CardContent>
      </Card>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && results.length === 0 && <p className="text-muted">No projects are competing at {LEVEL_LABELS[level]}.</p>}
      {sortedGroups.map(([group, rows]) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle className="text-base">{group}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Rank</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>School</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="text-center">Sheets</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...rows]
                  .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || (a.project.code ?? "").localeCompare(b.project.code ?? ""))
                  .map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono font-bold">{r.rank ?? "-"}</TableCell>
                      <TableCell>
                        <span className="mr-2 font-mono text-primary">{r.project.code}</span>
                        {r.project.title}
                      </TableCell>
                      <TableCell className="text-sm text-muted">{r.project.school.name}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{r.totalScore?.toFixed(2) ?? "-"}</TableCell>
                      <TableCell className="text-center text-sm">
                        {r.submittedJudges}/{r.assignedJudges}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_BADGE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                        {!r.isPublished && <span className="ml-1.5 text-xs text-muted">unpublished</span>}
                        {r.review && (
                          <Link href={`/admin/ksef/judging/reviews/${r.review.id}`} className="mt-1 block">
                            <Badge variant={r.review.status === "OPEN" ? "warning" : "outline"}>
                              {r.review.status === "OPEN" ? "⚠️ Discrepancy - Chief Judge review" : "Discrepancy reviewed"}
                            </Badge>
                          </Link>
                        )}
                      </TableCell>
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
