"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiDelete, apiGet } from "@/lib/api-client";
import { LEVEL_LABELS } from "@/lib/utils";
import type { LevelResultRow } from "./judges-manager";
import type { KsefEditionSummary } from "./types";
import type { Level } from "@prisma/client";

interface AssignmentRow {
  id: string;
  submittedAt: string | null;
  judge: { id: string; user: { name: string } };
  project: { id: string; code: string | null; title: string };
}

/**
 * Judging progress for a level: every competing project, its judges and
 * whether each has submitted. The admin can view any sheet read-only and
 * remove an assignment the judge hasn't submitted. Submitted sheets are
 * permanent - disputes go through Chief Judge review or a complaint.
 */
export function JudgingOverview({ edition }: { edition: KsefEditionSummary }) {
  const queryClient = useQueryClient();
  const readOnly = edition.status === "CLOSED";
  const [level, setLevel] = React.useState<Level>(edition.currentLevel);

  const { data: resultsData, isLoading } = useQuery({
    queryKey: ["ksef-results", edition.id, level],
    queryFn: () => apiGet<{ results: LevelResultRow[] }>(`/api/ksef/results?editionId=${edition.id}&level=${level}`),
  });
  const { data: assignmentsData } = useQuery({
    queryKey: ["ksef-assignments", edition.id, level],
    queryFn: () => apiGet<{ assignments: AssignmentRow[] }>(`/api/ksef/assignments?editionId=${edition.id}&level=${level}`),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["ksef-assignments", edition.id, level] });
    queryClient.invalidateQueries({ queryKey: ["ksef-results", edition.id, level] });
  };
  const onError = (error: unknown) => toast.error(error instanceof Error ? error.message : "Failed");
  const removeMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/ksef/assignments/${id}`),
    onSuccess: () => { toast.success("Assignment removed"); refresh(); },
    onError,
  });

  const byProject = new Map<string, AssignmentRow[]>();
  for (const a of assignmentsData?.assignments ?? []) byProject.set(a.project.id, [...(byProject.get(a.project.id) ?? []), a]);
  const projects = (resultsData?.results ?? [])
    .filter((r) => r.project.status === "SUBMITTED")
    .sort((a, b) => (a.project.code ?? "").localeCompare(b.project.code ?? ""));
  const sheets = assignmentsData?.assignments ?? [];
  const submitted = sheets.filter((a) => a.submittedAt).length;
  const unjudged = projects.filter((r) => !(byProject.get(r.project.id) ?? []).some((a) => a.submittedAt)).length;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Judging progress</CardTitle>
          <CardDescription>
            {submitted}/{sheets.length} score sheets submitted · {unjudged} project{unjudged === 1 ? "" : "s"} with no submitted sheet yet
          </CardDescription>
        </div>
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
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <p className="text-muted">Loading...</p>}
        {!isLoading && projects.length === 0 && <p className="text-muted">No projects are competing at {LEVEL_LABELS[level]} yet.</p>}
        {projects.map((r) => {
          const assigned = byProject.get(r.project.id) ?? [];
          return (
            <div key={r.id} className="flex flex-col gap-2 rounded-md border border-border p-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  <span className="mr-2 font-mono text-primary">{r.project.code}</span>
                  {r.project.title}
                </p>
                <p className="text-xs text-muted">
                  {r.project.category.name} · {r.project.school.name}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {assigned.length === 0 && (
                  <Badge variant="warning">
                    No judges - <Link href="/admin/ksef/judges" className="ml-1 underline">assign</Link>
                  </Badge>
                )}
                {assigned.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1 rounded-full border border-border py-0.5 pl-2.5 pr-1 text-xs">
                    <Link href={`/admin/ksef/judging/${a.id}`} className="hover:underline">
                      {a.judge.user.name}
                    </Link>
                    <Badge variant={a.submittedAt ? "success" : "warning"} className="px-1.5 py-0">
                      {a.submittedAt ? "submitted" : "pending"}
                    </Badge>
                    {a.submittedAt ? (
                      <Lock className="mr-1 h-3 w-3 text-muted" aria-label="Submitted sheets are permanent" />
                    ) : (
                      <button
                        type="button"
                        aria-label={`Remove ${a.judge.user.name}`}
                        className="rounded-full p-0.5 text-muted hover:text-foreground disabled:opacity-50"
                        disabled={readOnly || removeMutation.isPending}
                        onClick={() => removeMutation.mutate(a.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
