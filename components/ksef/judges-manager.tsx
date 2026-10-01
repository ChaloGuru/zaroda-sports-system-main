"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { KSEF_DIVISION_LABELS, KSEF_PANEL_ROLE_LABELS } from "@/lib/ksef-config";
import { LEVEL_LABELS } from "@/lib/utils";
import { JudgeInvites } from "./judge-invites";
import type { KsefEditionSummary } from "./types";
import type { Level } from "@prisma/client";

const PANEL_ROLES = ["JUDGE", "CHIEF_JUDGE", "SRC_MEMBER"] as const;

export interface JudgeRow {
  id: string;
  specialty: string | null;
  role: "JUDGE" | "CHIEF_JUDGE" | "SRC_MEMBER";
  isActive: boolean;
  assignedCount: number;
  submittedCount: number;
  user: { id: string; name: string; email: string; phone: string | null };
}

export interface LevelResultRow {
  id: string;
  unit: string;
  assignedJudges: number;
  submittedJudges: number;
  totalScore: number | null;
  judgeCount: number;
  rank: number | null;
  status: "PENDING" | "QUALIFIED" | "NOT_QUALIFIED";
  isPublished: boolean;
  /** Set when the project was flagged for a judging discrepancy at this level. */
  review: { id: string; status: "OPEN" | "APPROVED"; spread: number } | null;
  project: {
    id: string;
    code: string | null;
    title: string;
    status: string;
    school: { name: string; subcounty: string; county: string; region: string };
    category: { id: string; name: string; division: "JUNIOR_SCHOOL" | "SENIOR_SCHOOL" };
    subCategory: { name: string } | null;
    learners: { firstName: string; lastName: string }[];
  };
}

function AssignCard({ edition, judges }: { edition: KsefEditionSummary; judges: JudgeRow[] }) {
  const queryClient = useQueryClient();
  const readOnly = edition.status === "CLOSED";
  const [level, setLevel] = React.useState<Level>(edition.currentLevel);
  const [judgeId, setJudgeId] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("ALL");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const { data } = useQuery({
    queryKey: ["ksef-results", edition.id, level],
    queryFn: () => apiGet<{ results: LevelResultRow[] }>(`/api/ksef/results?editionId=${edition.id}&level=${level}`),
  });
  const competing = (data?.results ?? []).filter((r) => r.project.status === "SUBMITTED");
  const categories = Array.from(new Map(competing.map((r) => [r.project.category.id, r.project.category])).values());
  const shown = competing
    .filter((r) => categoryId === "ALL" || r.project.category.id === categoryId)
    .sort((a, b) => (a.project.code ?? "").localeCompare(b.project.code ?? ""));

  const assignMutation = useMutation({
    mutationFn: () => apiPost<{ assigned: number }>("/api/ksef/assignments", { judgeId, level, projectIds: Array.from(selected) }),
    onSuccess: ({ assigned }) => {
      toast.success(`${assigned} new assignment${assigned === 1 ? "" : "s"}`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["ksef-results", edition.id, level] });
      queryClient.invalidateQueries({ queryKey: ["ksef-judges", edition.id] });
      queryClient.invalidateQueries({ queryKey: ["ksef-assignments", edition.id, level] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to assign"),
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assign judges to projects</CardTitle>
        <CardDescription>Pick a judge, tick the projects they&apos;ll judge at this level, then assign. A project can have several judges.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Select value={level} onValueChange={(v) => { setLevel(v as Level); setSelected(new Set()); }}>
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
          <Select value={judgeId} onValueChange={setJudgeId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select judge" />
            </SelectTrigger>
            <SelectContent>
              {judges.filter((j) => j.isActive).map((j) => (
                <SelectItem key={j.id} value={j.id}>
                  {j.user.name}
                  {j.specialty ? ` (${j.specialty})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setSelected(new Set()); }}>
            <SelectTrigger className="w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({KSEF_DIVISION_LABELS[c.division]})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {competing.length === 0 ? (
          <p className="text-sm text-muted">No submitted projects are competing at {LEVEL_LABELS[level]} yet.</p>
        ) : (
          <div className="max-h-96 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            <label className="flex items-center gap-2 border-b border-border px-2 pb-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={shown.length > 0 && shown.every((r) => selected.has(r.project.id))}
                onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((r) => r.project.id)) : new Set())}
              />
              Select all shown ({shown.length})
            </label>
            {shown.map((r) => (
              <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-overlay">
                <input type="checkbox" checked={selected.has(r.project.id)} onChange={() => toggle(r.project.id)} />
                <span className="font-mono text-primary">{r.project.code}</span>
                <span className="min-w-0 flex-1 truncate">{r.project.title}</span>
                <span className="hidden text-xs text-muted md:inline">{r.project.school.name}</span>
                <Badge variant={r.assignedJudges === 0 ? "warning" : "outline"}>
                  {r.assignedJudges} judge{r.assignedJudges === 1 ? "" : "s"}
                </Badge>
              </label>
            ))}
          </div>
        )}

        <Button disabled={readOnly || !judgeId || selected.size === 0 || assignMutation.isPending} onClick={() => assignMutation.mutate()}>
          Assign {selected.size > 0 ? `${selected.size} project${selected.size === 1 ? "" : "s"}` : ""}
        </Button>
      </CardContent>
    </Card>
  );
}

export function JudgesManager({ edition }: { edition: KsefEditionSummary }) {
  const queryClient = useQueryClient();
  const readOnly = edition.status === "CLOSED";
  const { data, isLoading } = useQuery({
    queryKey: ["ksef-judges", edition.id],
    queryFn: () => apiGet<{ judges: JudgeRow[] }>(`/api/ksef/judges?editionId=${edition.id}`),
  });
  const judges = data?.judges ?? [];

  const toggleMutation = useMutation({
    mutationFn: (judge: JudgeRow) => apiPatch(`/api/ksef/judges/${judge.id}`, { isActive: !judge.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ksef-judges", edition.id] }),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to update judge"),
  });
  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => apiPatch(`/api/ksef/judges/${id}`, { role }),
    onSuccess: () => {
      toast.success("Panel role updated");
      queryClient.invalidateQueries({ queryKey: ["ksef-judges", edition.id] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to update role"),
  });

  return (
    <div className="space-y-6">
      <JudgeInvites edition={edition} />
      <Card>
        <CardHeader>
          <CardTitle>Judging panel ({judges.length})</CardTitle>
          <CardDescription>Deactivated judges keep their submitted score sheets but can&apos;t be given new projects.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-muted">Loading...</p>}
          {!isLoading && judges.length === 0 && <p className="text-muted">No judges yet.</p>}
          {judges.map((j) => (
            <div key={j.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
              <div>
                <p className="flex items-center gap-2 font-medium text-foreground">
                  {j.user.name}
                  {!j.isActive && <Badge variant="secondary">inactive</Badge>}
                </p>
                <p className="text-sm text-muted">
                  {j.user.email}
                  {j.user.phone ? ` · ${j.user.phone}` : ""}
                  {j.specialty ? ` · ${j.specialty}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-muted">
                  {j.submittedCount}/{j.assignedCount} sheets submitted
                </span>
                <Select value={j.role} onValueChange={(role) => roleMutation.mutate({ id: j.id, role })} disabled={readOnly || roleMutation.isPending}>
                  <SelectTrigger className="h-8 w-36 text-xs" aria-label={`${j.user.name}'s panel role`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PANEL_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {KSEF_PANEL_ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="ghost" disabled={readOnly || toggleMutation.isPending} onClick={() => toggleMutation.mutate(j)}>
                  {j.isActive ? "Deactivate" : "Reactivate"}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      {!readOnly && <AssignCard edition={edition} judges={judges} />}
    </div>
  );
}
