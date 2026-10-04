"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { ASSIGNABLE_PANEL_ROLE, KSEF_DIVISIONS, KSEF_DIVISION_LABELS, KSEF_PANEL_ROLE_LABELS } from "@/lib/ksef-config";
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

type SchoolLevelScope = "ALL" | "JUNIOR_SCHOOL" | "SENIOR_SCHOOL";

function AssignCard({ edition, judges }: { edition: KsefEditionSummary; judges: JudgeRow[] }) {
  const queryClient = useQueryClient();
  const readOnly = edition.status === "CLOSED";
  const [mode, setMode] = React.useState<"manual" | "auto">("manual");
  const [level, setLevel] = React.useState<Level>(edition.currentLevel);
  const [judgeIds, setJudgeIds] = React.useState<Set<string>>(new Set());
  // Chief Judges and SRC members are never given projects to score.
  const assignableJudges = judges.filter((j) => j.isActive && j.role === ASSIGNABLE_PANEL_ROLE);
  const leftOut = judges.filter((j) => j.isActive && j.role !== ASSIGNABLE_PANEL_ROLE);
  const [categoryId, setCategoryId] = React.useState("ALL");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [scope, setScope] = React.useState<SchoolLevelScope>("ALL");
  const [perProject, setPerProject] = React.useState(3);

  const { data } = useQuery({
    queryKey: ["ksef-results", edition.id, level],
    queryFn: () => apiGet<{ results: LevelResultRow[] }>(`/api/ksef/results?editionId=${edition.id}&level=${level}`),
  });
  // Who already judges each project at this level (same query as the judging overview).
  const { data: assignmentData } = useQuery({
    queryKey: ["ksef-assignments", edition.id, level],
    queryFn: () =>
      apiGet<{ assignments: { submittedAt: string | null; judge: { id: string; user: { name: string } }; project: { id: string } }[] }>(
        `/api/ksef/assignments?editionId=${edition.id}&level=${level}`,
      ),
  });
  const judgesByProject = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string; submitted: boolean }[]>();
    for (const a of assignmentData?.assignments ?? []) {
      map.set(a.project.id, [...(map.get(a.project.id) ?? []), { id: a.judge.id, name: a.judge.user.name, submitted: !!a.submittedAt }]);
    }
    return map;
  }, [assignmentData]);
  const competing = (data?.results ?? []).filter((r) => r.project.status === "SUBMITTED");
  const categories = Array.from(new Map(competing.map((r) => [r.project.category.id, r.project.category])).values());
  const shown = competing
    .filter((r) => categoryId === "ALL" || r.project.category.id === categoryId)
    .sort((a, b) => (a.project.code ?? "").localeCompare(b.project.code ?? ""));
  const inScope = competing.filter((r) => scope === "ALL" || r.project.category.division === scope);
  const needingJudges = inScope.filter((r) => r.assignedJudges < perProject).length;

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["ksef-results", edition.id, level] });
    queryClient.invalidateQueries({ queryKey: ["ksef-judges", edition.id] });
    queryClient.invalidateQueries({ queryKey: ["ksef-assignments", edition.id, level] });
  }

  const assignMutation = useMutation({
    mutationFn: () =>
      apiPost<{ assigned: number }>("/api/ksef/assignments", { judgeIds: Array.from(judgeIds), level, projectIds: Array.from(selected) }),
    onSuccess: ({ assigned }) => {
      toast.success(`${assigned} new assignment${assigned === 1 ? "" : "s"}`);
      setSelected(new Set());
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to assign"),
  });

  const autoMutation = useMutation({
    mutationFn: () =>
      apiPost<{ assigned: number; projects: number; shortfall: { code: string | null; missing: number }[] }>("/api/ksef/assignments/auto", {
        editionId: edition.id,
        level,
        division: scope,
        judgeIds: Array.from(judgeIds),
        judgesPerProject: perProject,
      }),
    onSuccess: ({ assigned, shortfall }) => {
      toast.success(`${assigned} new assignment${assigned === 1 ? "" : "s"}`);
      if (shortfall.length > 0) {
        toast.warning(
          `${shortfall.length} project${shortfall.length === 1 ? "" : "s"} couldn't get ${perProject} judges - not enough judges selected (${shortfall
            .map((s) => s.code ?? "?")
            .join(", ")})`,
          { duration: 10_000 },
        );
      }
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to auto-assign"),
  });

  function toggleIn(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const toggle = (id: string) => toggleIn(setSelected, id);

  function runAuto() {
    const scopeLabel = scope === "ALL" ? "all school levels" : KSEF_DIVISION_LABELS[scope];
    if (
      window.confirm(
        `Give every ${LEVEL_LABELS[level]} project (${scopeLabel}) up to ${perProject} judges from the ${judgeIds.size} selected? Existing assignments stay as they are.`,
      )
    ) {
      autoMutation.mutate();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assign judges to projects</CardTitle>
        <CardDescription>
          Assign by hand, or let the system share projects out evenly. Existing assignments are always kept. Only panel members with the
          Judge role are given projects - Chief Judges and SRC members are left out.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={mode} onValueChange={(v) => setMode(v as "manual" | "auto")}>
          <TabsList>
            <TabsTrigger value="manual">Manual</TabsTrigger>
            <TabsTrigger value="auto">Automatic</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap gap-2">
          <Select value={level} onValueChange={(v) => { setLevel(v as Level); setSelected(new Set()); }}>
            <SelectTrigger className="w-44" aria-label="Competition level">
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
          {mode === "manual" ? (
            <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setSelected(new Set()); }}>
              <SelectTrigger className="w-72" aria-label="Category">
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
          ) : (
            <>
              <Select value={scope} onValueChange={(v) => setScope(v as SchoolLevelScope)}>
                <SelectTrigger className="w-52" aria-label="School level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All school levels</SelectItem>
                  {KSEF_DIVISIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {KSEF_DIVISION_LABELS[d]} only
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(perProject)} onValueChange={(v) => setPerProject(Number(v))}>
                <SelectTrigger className="w-48" aria-label="Judges per project">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} judge{n === 1 ? "" : "s"} per project
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>

        {assignableJudges.length === 0 ? (
          <p className="text-sm text-muted">No active judges on the panel yet.</p>
        ) : (
          <div className="space-y-1 rounded-md border border-border p-2">
            <label className="flex items-center gap-2 border-b border-border px-2 pb-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={assignableJudges.every((j) => judgeIds.has(j.id))}
                onChange={(e) => setJudgeIds(e.target.checked ? new Set(assignableJudges.map((j) => j.id)) : new Set())}
              />
              Judges - select all ({assignableJudges.length})
            </label>
            <div className="grid gap-1 sm:grid-cols-2">
              {assignableJudges.map((j) => (
                <label key={j.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-overlay">
                  <input type="checkbox" checked={judgeIds.has(j.id)} onChange={() => toggleIn(setJudgeIds, j.id)} />
                  <span className="min-w-0 flex-1 truncate">
                    {j.user.name}
                    {j.specialty ? ` (${j.specialty})` : ""}
                  </span>
                  <span className="text-xs text-muted">{j.assignedCount} assigned</span>
                </label>
              ))}
            </div>
            {leftOut.length > 0 && (
              <p className="px-2 pt-1 text-xs text-muted">
                Not given projects: {leftOut.map((j) => `${j.user.name} (${KSEF_PANEL_ROLE_LABELS[j.role]})`).join(", ")}.
              </p>
            )}
          </div>
        )}

        {mode === "manual" && (
          <>
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
                {shown.map((r) => {
                  const assigned = judgesByProject.get(r.project.id) ?? [];
                  return (
                    <label key={r.id} className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-overlay">
                      <input type="checkbox" className="mt-1" checked={selected.has(r.project.id)} onChange={() => toggle(r.project.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-primary">{r.project.code}</span>
                          <span className="min-w-0 flex-1 truncate">{r.project.title}</span>
                          <span className="hidden text-xs text-muted md:inline">{r.project.school.name}</span>
                          <Badge variant={r.assignedJudges === 0 ? "warning" : "outline"}>
                            {r.assignedJudges} judge{r.assignedJudges === 1 ? "" : "s"}
                          </Badge>
                        </span>
                        <span className="block text-xs text-muted">
                          {!assignmentData
                            ? ""
                            : assigned.length === 0
                            ? "No judges yet"
                            : assigned.map((j, i) => (
                                <React.Fragment key={j.id}>
                                  {i > 0 && ", "}
                                  <span
                                    className={judgeIds.has(j.id) ? "font-semibold text-foreground" : undefined}
                                    title={judgeIds.has(j.id) ? "Ticked above - already has this project, so it will be skipped" : undefined}
                                  >
                                    {j.name}
                                    {j.submitted ? " ✓" : ""}
                                  </span>
                                </React.Fragment>
                              ))}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            <Button disabled={readOnly || judgeIds.size === 0 || selected.size === 0 || assignMutation.isPending} onClick={() => assignMutation.mutate()}>
              {judgeIds.size > 0 && selected.size > 0
                ? `Assign ${selected.size} project${selected.size === 1 ? "" : "s"} to ${judgeIds.size} judge${judgeIds.size === 1 ? "" : "s"}`
                : "Assign"}
            </Button>
          </>
        )}

        {mode === "auto" && (
          <>
            <p className="text-sm text-muted">
              {inScope.length === 0
                ? `No submitted ${scope === "ALL" ? "" : `${KSEF_DIVISION_LABELS[scope]} `}projects are competing at ${LEVEL_LABELS[level]} yet.`
                : `${inScope.length} project${inScope.length === 1 ? "" : "s"} in scope, ${needingJudges} with fewer than ${perProject} judge${perProject === 1 ? "" : "s"}. Each place goes to the selected judge with the fewest projects, and no judge gets the same project twice.`}
            </p>
            {judgeIds.size > 0 && judgeIds.size < perProject && (
              <p className="text-sm text-foreground">
                Select at least {perProject} judges to give every project {perProject}.
              </p>
            )}
            <Button disabled={readOnly || judgeIds.size === 0 || needingJudges === 0 || autoMutation.isPending} onClick={runAuto}>
              {autoMutation.isPending ? "Assigning..." : `Auto-assign ${needingJudges} project${needingJudges === 1 ? "" : "s"}`}
            </Button>
          </>
        )}
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
