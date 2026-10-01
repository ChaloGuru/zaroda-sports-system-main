"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { KSEF_DIVISION_LABELS } from "@/lib/ksef-config";
import { LEVEL_LABELS } from "@/lib/utils";
import type { KsefEditionSummary } from "./types";
import type { Level } from "@prisma/client";

export interface JudgeRow {
  id: string;
  specialty: string | null;
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

function AddJudgeCard({ edition }: { edition: KsefEditionSummary }) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState({ email: "", name: "", phone: "", password: "", specialty: "" });
  const addMutation = useMutation({
    mutationFn: () => apiPost("/api/ksef/judges", { editionId: edition.id, ...form, password: form.password || undefined }),
    onSuccess: () => {
      toast.success("Judge added to the panel");
      setForm({ email: "", name: "", phone: "", password: "", specialty: "" });
      queryClient.invalidateQueries({ queryKey: ["ksef-judges", edition.id] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to add judge"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a judge</CardTitle>
        <CardDescription>
          Use the judge&apos;s email. If they already have a Zaroda account it&apos;s reused; otherwise enter a name and
          password to create one. Judges sign in and score from their own dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Email</Label>
            <Input className="mt-1.5" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <Label>Full name (new accounts)</Label>
            <Input className="mt-1.5" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label>Password (new accounts)</Label>
            <PasswordInput className="mt-1.5" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          </div>
          <div>
            <Label>Phone (optional)</Label>
            <Input className="mt-1.5" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <Label>Specialty (optional)</Label>
            <Input className="mt-1.5" placeholder="e.g. Chemistry, Computer Science" value={form.specialty} onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))} />
          </div>
        </div>
        <Button disabled={!form.email.trim() || addMutation.isPending} onClick={() => addMutation.mutate()}>
          <UserPlus className="h-4 w-4" /> Add judge
        </Button>
      </CardContent>
    </Card>
  );
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

  return (
    <div className="space-y-6">
      {!readOnly && <AddJudgeCard edition={edition} />}
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
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted">
                  {j.submittedCount}/{j.assignedCount} sheets submitted
                </span>
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
