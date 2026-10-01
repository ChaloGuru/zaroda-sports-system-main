"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { KSEF_LEVELS } from "@/lib/ksef-config";
import { LEVEL_LABELS, formatDate } from "@/lib/utils";
import { EDITION_STATUS_BADGE, type KsefEditionSummary } from "./types";

interface EditionRow extends KsefEditionSummary {
  _count: { projects: number; schools: number; categories: number; judges: number };
}

function dateInput(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function NewEditionDialog({ editions }: { editions: EditionRow[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const nextYear = Math.max(new Date().getFullYear(), ...editions.map((e) => e.year + 1));
  const [form, setForm] = React.useState({
    year: String(nextYear),
    name: "",
    startDate: "",
    endDate: "",
    configSource: editions.length > 0 ? "COPY" : "STANDARD",
    copyFromEditionId: editions[0]?.id ?? "",
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiPost<{ edition: { id: string; name: string } }>("/api/ksef/editions", {
        year: Number(form.year),
        name: form.name,
        startDate: form.startDate,
        endDate: form.endDate,
        configSource: form.configSource,
        copyFromEditionId: form.configSource === "COPY" ? form.copyFromEditionId : undefined,
      }),
    onSuccess: ({ edition }) => {
      toast.success(`${edition.name} created`);
      // Switch every KSEF page to the new edition.
      document.cookie = `ksef_edition=${edition.id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      queryClient.invalidateQueries({ queryKey: ["ksef-editions"] });
      setOpen(false);
      router.refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to create edition"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Create New KSEF Edition
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New KSEF Edition</DialogTitle>
          <DialogDescription>
            A new competition year starts with no schools, projects, scores or results. Earlier editions are not changed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Year</Label>
              <Input className="mt-1.5" inputMode="numeric" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} />
            </div>
            <div>
              <Label>Name (optional)</Label>
              <Input className="mt-1.5" placeholder={`KSEF ${form.year || "YYYY"}`} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Start date</Label>
              <Input className="mt-1.5" type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <Label>End date</Label>
              <Input className="mt-1.5" type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Categories and judging criteria</Label>
            <Select value={form.configSource} onValueChange={(v) => setForm((f) => ({ ...f, configSource: v }))}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {editions.length > 0 && <SelectItem value="COPY">Copy from an earlier edition</SelectItem>}
                <SelectItem value="STANDARD">Start from the standard KSEF structure</SelectItem>
                <SelectItem value="EMPTY">Start empty</SelectItem>
              </SelectContent>
            </Select>
            {form.configSource === "COPY" && (
              <Select value={form.copyFromEditionId} onValueChange={(v) => setForm((f) => ({ ...f, copyFromEditionId: v }))}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Edition to copy" />
                </SelectTrigger>
                <SelectContent>
                  {editions.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="mt-1.5 text-xs text-muted">
              Whatever you start from is copied into the new edition - edit it freely in Configuration without affecting
              any other year.
            </p>
          </div>
          <Button className="w-full" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.year}>
            {createMutation.isPending ? "Creating..." : "Create edition"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditionSettingsDialog({ edition }: { edition: EditionRow }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    name: edition.name,
    startDate: dateInput(edition.startDate),
    endDate: dateInput(edition.endDate),
    levels: edition.levels,
    currentLevel: edition.currentLevel,
    qualifiersPerCategory: String(edition.qualifiersPerCategory),
    discrepancyThreshold: edition.discrepancyThreshold === null ? "" : String(edition.discrepancyThreshold),
    discrepancyBasis: edition.discrepancyBasis,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiPatch(`/api/ksef/editions/${edition.id}`, {
        name: form.name,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        levels: form.levels,
        currentLevel: form.currentLevel,
        qualifiersPerCategory: Number(form.qualifiersPerCategory),
        discrepancyThreshold: form.discrepancyThreshold.trim() === "" ? null : Number(form.discrepancyThreshold),
        discrepancyBasis: form.discrepancyBasis,
      }),
    onSuccess: () => {
      toast.success("Edition settings saved");
      queryClient.invalidateQueries({ queryKey: ["ksef-editions"] });
      setOpen(false);
      router.refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to save"),
  });

  function toggleLevel(level: (typeof KSEF_LEVELS)[number]) {
    setForm((f) => ({
      ...f,
      levels: f.levels.includes(level) ? f.levels.filter((l) => l !== level) : KSEF_LEVELS.filter((l) => l === level || f.levels.includes(l)),
    }));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={edition.status === "CLOSED"}>
          <Settings className="h-3.5 w-3.5" /> Settings
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{edition.name} settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input className="mt-1.5" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Start date</Label>
              <Input className="mt-1.5" type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <Label>End date</Label>
              <Input className="mt-1.5" type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Competition levels</Label>
            <div className="mt-1.5 flex flex-wrap gap-3">
              {KSEF_LEVELS.map((l) => (
                <label key={l} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={form.levels.includes(l)} onChange={() => toggleLevel(l)} />
                  {LEVEL_LABELS[l]}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">Locked once projects have been submitted.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Current level</Label>
              <Select value={form.currentLevel} onValueChange={(v) => setForm((f) => ({ ...f, currentLevel: v as typeof f.currentLevel }))}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {form.levels.map((l) => (
                    <SelectItem key={l} value={l}>
                      {LEVEL_LABELS[l]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Qualifiers per category</Label>
              <Input
                className="mt-1.5"
                inputMode="numeric"
                value={form.qualifiersPerCategory}
                onChange={(e) => setForm((f) => ({ ...f, qualifiersPerCategory: e.target.value }))}
              />
            </div>
          </div>
          <p className="text-xs text-muted">
            Qualifiers per category: how many top-ranked projects in each category, within each sub-county / county /
            region, progress to the next level.
          </p>
          <div className="space-y-2 rounded-md border border-border p-3">
            <Label>Judging discrepancy threshold</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="h-9 w-28"
                inputMode="decimal"
                placeholder="Not set"
                value={form.discrepancyThreshold}
                onChange={(e) => setForm((f) => ({ ...f, discrepancyThreshold: e.target.value }))}
              />
              <Select value={form.discrepancyBasis} onValueChange={(v) => setForm((f) => ({ ...f, discrepancyBasis: v as typeof f.discrepancyBasis }))}>
                <SelectTrigger className="h-9 w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="POINTS">marks between judges&apos; totals</SelectItem>
                  <SelectItem value="PERCENT">% of the score sheet maximum</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted">
              Enter the value from the applicable KSEF rules for this competition year - Zaroda doesn&apos;t assume one. When
              judges&apos; totals for a project differ by more than this, it&apos;s flagged for Chief Judge review. Results can&apos;t be
              published until a threshold is set.
            </p>
          </div>
          <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || form.levels.length === 0}>
            {saveMutation.isPending ? "Saving..." : "Save settings"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CompetitionsManager() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["ksef-editions"],
    queryFn: () => apiGet<{ editions: EditionRow[] }>("/api/ksef/editions"),
  });
  const editions = data?.editions ?? [];

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiPatch(`/api/ksef/editions/${id}`, { status }),
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["ksef-editions"] });
      router.refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to update status"),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>KSEF editions</CardTitle>
          <CardDescription>One edition per competition year, each with its own independent configuration.</CardDescription>
        </div>
        {!isLoading && <NewEditionDialog key={editions.length} editions={editions} />}
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <p className="text-muted">Loading...</p>}
        {!isLoading && editions.length === 0 && <p className="text-muted">No editions yet - create the first one.</p>}
        {editions.map((e) => (
          <div key={e.id} className="flex flex-col gap-3 rounded-md border border-border p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="flex items-center gap-2 font-semibold text-foreground">
                {e.name}
                <Badge variant={EDITION_STATUS_BADGE[e.status]}>{e.status.toLowerCase()}</Badge>
              </p>
              <p className="text-sm text-muted">
                {e.startDate ? `${formatDate(e.startDate)}${e.endDate ? ` - ${formatDate(e.endDate)}` : ""} · ` : ""}
                {e.levels.map((l) => LEVEL_LABELS[l]).join(" → ")} · now at {LEVEL_LABELS[e.currentLevel]}
              </p>
              <p className="text-xs text-muted">
                {e._count.schools} schools · {e._count.projects} projects · {e._count.judges} judges · {e._count.categories} categories
              </p>
              <p className="text-xs">
                {e.discrepancyThreshold === null ? (
                  <span className="font-medium text-[#B45309]">Judging discrepancy threshold not set - open Settings</span>
                ) : (
                  <span className="text-muted">
                    Discrepancy threshold: {e.discrepancyThreshold}
                    {e.discrepancyBasis === "PERCENT" ? "% of the maximum total" : " marks"}
                  </span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <EditionSettingsDialog key={`${e.id}:${e.status}`} edition={e} />
              {e.status === "DRAFT" && (
                <Button size="sm" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: e.id, status: "ACTIVE" })}>
                  Activate
                </Button>
              )}
              {e.status === "ACTIVE" && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={statusMutation.isPending}
                  onClick={() => {
                    if (confirm(`Close ${e.name}? A closed edition becomes read-only.`)) statusMutation.mutate({ id: e.id, status: "CLOSED" });
                  }}
                >
                  Close
                </Button>
              )}
              {e.status === "CLOSED" && (
                <Button size="sm" variant="outline" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: e.id, status: "ACTIVE" })}>
                  Reopen
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
