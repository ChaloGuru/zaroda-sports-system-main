"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiDelete, apiGet, apiPost } from "@/lib/api-client";
import { KSEF_DIVISIONS, KSEF_DIVISION_LABELS } from "@/lib/ksef-config";
import { LEVEL_LABELS } from "@/lib/utils";
import { ProjectDialog, type ProjectRow } from "./project-dialog";
import type { KsefCategoryRow, KsefCriterionRow, KsefEditionSummary } from "./types";
import type { Level } from "@prisma/client";

const STATUS_BADGE = { DRAFT: "outline", SUBMITTED: "success", WITHDRAWN: "secondary" } as const;

export function ProjectsManager({ edition }: { edition: KsefEditionSummary }) {
  const queryClient = useQueryClient();
  const readOnly = edition.status === "CLOSED";
  const [dialog, setDialog] = React.useState<{ project: ProjectRow | null; key: number } | null>(null);
  const [filters, setFilters] = React.useState({ search: "", division: "ALL", categoryId: "ALL", status: "ALL" });

  const { data: projectsData, isLoading } = useQuery({
    queryKey: ["ksef-projects", edition.id],
    queryFn: () => apiGet<{ projects: ProjectRow[] }>(`/api/ksef/projects?editionId=${edition.id}`),
  });
  const { data: schoolsData } = useQuery({
    queryKey: ["ksef-schools", edition.id],
    queryFn: () => apiGet<{ schools: { schoolId: string; name: string }[] }>(`/api/ksef/schools?editionId=${edition.id}`),
  });
  const { data: config } = useQuery({
    queryKey: ["ksef-config", edition.id],
    queryFn: () => apiGet<{ categories: KsefCategoryRow[]; criteria: KsefCriterionRow[] }>(`/api/ksef/config?editionId=${edition.id}`),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["ksef-projects", edition.id] });
  const statusMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => apiPost(`/api/ksef/projects/${id}/status`, { action }),
    onSuccess: (_data, { action }) => {
      toast.success(
        { SUBMIT: "Project submitted", RETURN_TO_DRAFT: "Returned to draft", WITHDRAW: "Project withdrawn", REINSTATE: "Project reinstated" }[action] ?? "Updated",
      );
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to update project"),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/ksef/projects/${id}`),
    onSuccess: () => {
      toast.success("Draft deleted");
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to delete"),
  });

  const categories = config?.categories ?? [];
  const projects = (projectsData?.projects ?? []).filter((p) => {
    const q = filters.search.toLowerCase();
    return (
      (!q || `${p.code ?? ""} ${p.title} ${p.school.name}`.toLowerCase().includes(q)) &&
      (filters.division === "ALL" || p.category.division === filters.division) &&
      (filters.categoryId === "ALL" || p.category.id === filters.categoryId) &&
      (filters.status === "ALL" || p.status === filters.status)
    );
  });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle>Projects ({projectsData?.projects.length ?? 0})</CardTitle>
          <CardDescription>
            Register a project as a draft, add its learners and mentor, then submit it - submitting assigns its project code.
          </CardDescription>
        </div>
        <Button disabled={readOnly} onClick={() => setDialog({ project: null, key: Date.now() })}>
          <Plus className="h-4 w-4" /> Register project
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input className="w-64" placeholder="Search code, title or school..." value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
          <Select value={filters.division} onValueChange={(v) => setFilters((f) => ({ ...f, division: v, categoryId: "ALL" }))}>
            <SelectTrigger className="w-44">
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
          <Select value={filters.categoryId} onValueChange={(v) => setFilters((f) => ({ ...f, categoryId: v }))}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All categories</SelectItem>
              {categories
                .filter((c) => filters.division === "ALL" || c.division === filters.division)
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="SUBMITTED">Submitted</SelectItem>
              <SelectItem value="WITHDRAWN">Withdrawn</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading && <p className="text-muted">Loading...</p>}
        {!isLoading && projects.length === 0 && <p className="text-muted">No projects match.</p>}
        {projects.map((p) => (
          <div key={p.id} className="flex flex-col gap-3 rounded-md border border-border p-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
                {p.code && <span className="font-mono text-primary">{p.code}</span>}
                {p.title}
                <Badge variant={STATUS_BADGE[p.status]}>{p.status.toLowerCase()}</Badge>
                {p.status === "SUBMITTED" && <Badge variant="outline">{LEVEL_LABELS[p.currentLevel as Level]}</Badge>}
              </p>
              <p className="text-sm text-muted">
                {p.school.name} ({p.school.subcounty}, {p.school.county}) · {KSEF_DIVISION_LABELS[p.category.division]} · {p.category.name}
                {p.subCategory ? ` / ${p.subCategory.name}` : ""}
              </p>
              <p className="text-xs text-muted">
                Learners: {p.learners.length > 0 ? p.learners.map((l) => `${l.firstName} ${l.lastName}`).join(", ") : "none yet"} · Mentor:{" "}
                {p.mentors.length > 0 ? p.mentors.map((m) => m.name).join(", ") : "none yet"}
              </p>
              {p.documentUrl && (
                <a href={p.documentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline">
                  <FileText className="h-3.5 w-3.5" /> Project report
                </a>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={readOnly} onClick={() => setDialog({ project: p, key: Date.now() })}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              {p.status === "DRAFT" && (
                <>
                  <Button size="sm" disabled={readOnly || statusMutation.isPending} onClick={() => statusMutation.mutate({ id: p.id, action: "SUBMIT" })}>
                    Submit
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Delete draft"
                    disabled={readOnly || deleteMutation.isPending}
                    onClick={() => confirm(`Delete the draft "${p.title}"?`) && deleteMutation.mutate(p.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
              {p.status === "SUBMITTED" && (
                <>
                  <Button size="sm" variant="ghost" disabled={readOnly || statusMutation.isPending} onClick={() => statusMutation.mutate({ id: p.id, action: "RETURN_TO_DRAFT" })}>
                    Return to draft
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={readOnly || statusMutation.isPending}
                    onClick={() => confirm(`Withdraw "${p.title}" from the competition?`) && statusMutation.mutate({ id: p.id, action: "WITHDRAW" })}
                  >
                    Withdraw
                  </Button>
                </>
              )}
              {p.status === "WITHDRAWN" && (
                <Button size="sm" variant="outline" disabled={readOnly || statusMutation.isPending} onClick={() => statusMutation.mutate({ id: p.id, action: "REINSTATE" })}>
                  Reinstate
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>

      {dialog && (
        <ProjectDialog
          key={dialog.key}
          edition={edition}
          schools={schoolsData?.schools ?? []}
          categories={categories}
          project={dialog.project}
          open
          onOpenChange={(open) => !open && setDialog(null)}
        />
      )}
    </Card>
  );
}
