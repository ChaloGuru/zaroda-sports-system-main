"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { KSEF_DIVISIONS, KSEF_DIVISION_LABELS } from "@/lib/ksef-config";
import { cn } from "@/lib/utils";
import type { KsefCategoryRow, KsefCriterionRow, KsefEditionSummary } from "./types";
import type { KsefDivision } from "@prisma/client";

/** A name shown as text, switching to an input while being renamed. */
function InlineName({
  value,
  disabled,
  onSave,
  className,
}: {
  value: string;
  disabled: boolean;
  onSave: (name: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  if (!editing) {
    return (
      <span className={cn("flex items-center gap-1.5", className)}>
        {value}
        {!disabled && (
          <button type="button" aria-label={`Rename ${value}`} className="text-muted hover:text-foreground" onClick={() => { setDraft(value); setEditing(true); }}>
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <Input className="h-8" value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} />
      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Save" disabled={!draft.trim()} onClick={() => { onSave(draft.trim()); setEditing(false); }}>
        <Check className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Cancel" onClick={() => setEditing(false)}>
        <X className="h-4 w-4" />
      </Button>
    </span>
  );
}

function AddRow({ placeholder, disabled, onAdd }: { placeholder: string; disabled: boolean; onAdd: (name: string) => Promise<unknown> }) {
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit() {
    setBusy(true);
    try {
      await onAdd(name.trim());
      setName("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex gap-2">
      <Input className="h-9" placeholder={placeholder} value={name} disabled={disabled} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && submit()} />
      <Button size="sm" className="h-9" disabled={disabled || busy || !name.trim()} onClick={submit}>
        <Plus className="h-4 w-4" /> Add
      </Button>
    </div>
  );
}

function CategoriesCard({ edition, categories, division, readOnly }: { edition: KsefEditionSummary; categories: KsefCategoryRow[]; division: KsefDivision; readOnly: boolean }) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["ksef-config", edition.id] });
  const onError = (error: unknown) => toast.error(error instanceof Error ? error.message : "Failed to save");

  const patchCategory = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; isActive?: boolean }) => apiPatch(`/api/ksef/categories/${id}`, body),
    onSuccess: refresh,
    onError,
  });
  const patchSub = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; isActive?: boolean }) => apiPatch(`/api/ksef/sub-categories/${id}`, body),
    onSuccess: refresh,
    onError,
  });

  async function add(fn: () => Promise<unknown>, message: string) {
    try {
      await fn();
      toast.success(message);
      refresh();
    } catch (error) {
      onError(error);
      throw error;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{KSEF_DIVISION_LABELS[division]} categories</CardTitle>
        <CardDescription>Disabled categories stay on existing projects but can't be chosen for new ones.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {categories.length === 0 && <p className="text-sm text-muted">No categories yet.</p>}
        {categories.map((c) => (
          <div key={c.id} className={cn("rounded-md border border-border p-3", !c.isActive && "opacity-60")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <InlineName value={c.name} disabled={readOnly} className="font-medium text-foreground" onSave={(name) => patchCategory.mutate({ id: c.id, name })} />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">{c._count.projects} projects</span>
                {!c.isActive && <Badge variant="secondary">disabled</Badge>}
                <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => patchCategory.mutate({ id: c.id, isActive: !c.isActive })}>
                  {c.isActive ? "Disable" : "Enable"}
                </Button>
              </div>
            </div>
            <div className="mt-2 space-y-1.5 border-l border-border pl-3">
              {c.subCategories.map((s) => (
                <div key={s.id} className={cn("flex items-center justify-between gap-2 text-sm", !s.isActive && "opacity-60")}>
                  <InlineName value={s.name} disabled={readOnly} onSave={(name) => patchSub.mutate({ id: s.id, name })} />
                  <Button size="sm" variant="ghost" className="h-7" disabled={readOnly} onClick={() => patchSub.mutate({ id: s.id, isActive: !s.isActive })}>
                    {s.isActive ? "Disable" : "Enable"}
                  </Button>
                </div>
              ))}
              <AddRow
                placeholder="Add sub-category"
                disabled={readOnly}
                onAdd={(name) => add(() => apiPost("/api/ksef/sub-categories", { categoryId: c.id, name }), "Sub-category added")}
              />
            </div>
          </div>
        ))}
        <AddRow
          placeholder={`New ${KSEF_DIVISION_LABELS[division]} category`}
          disabled={readOnly}
          onAdd={(name) => add(() => apiPost("/api/ksef/categories", { editionId: edition.id, division, name }), "Category added")}
        />
      </CardContent>
    </Card>
  );
}

function CriterionEditor({ criterion, readOnly }: { criterion: KsefCriterionRow; readOnly: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState({
    name: criterion.name,
    description: criterion.description ?? "",
    maxScore: String(criterion.maxScore),
    division: criterion.division ?? "BOTH",
    section: criterion.section ?? "",
    levelScored: criterion.levelScored,
  });
  const dirty =
    form.name !== criterion.name ||
    form.description !== (criterion.description ?? "") ||
    form.maxScore !== String(criterion.maxScore) ||
    form.division !== (criterion.division ?? "BOTH") ||
    form.section !== (criterion.section ?? "") ||
    form.levelScored !== criterion.levelScored;

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPatch(`/api/ksef/criteria/${criterion.id}`, body),
    onSuccess: () => {
      toast.success("Criterion saved");
      queryClient.invalidateQueries({ queryKey: ["ksef-config"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to save"),
  });

  return (
    <div className={cn("grid gap-2 rounded-md border border-border p-3 md:grid-cols-[1fr_1.4fr_90px_150px_auto]", !criterion.isActive && "opacity-60")}>
      <Input className="h-9" value={form.name} disabled={readOnly} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} aria-label="Criterion name" />
      <Input className="h-9" placeholder="Description" value={form.description} disabled={readOnly} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} aria-label="Description" />
      <Input className="h-9 font-mono" inputMode="numeric" value={form.maxScore} disabled={readOnly} onChange={(e) => setForm((f) => ({ ...f, maxScore: e.target.value }))} aria-label="Maximum score" />
      <Select value={form.division} onValueChange={(v) => setForm((f) => ({ ...f, division: v }))} disabled={readOnly}>
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="BOTH">Both divisions</SelectItem>
          {KSEF_DIVISIONS.map((d) => (
            <SelectItem key={d} value={d}>
              {KSEF_DIVISION_LABELS[d]} only
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex gap-1">
        <Button
          size="sm"
          className="h-9"
          disabled={readOnly || !dirty || patch.isPending}
          onClick={() =>
            patch.mutate({
              name: form.name,
              description: form.description,
              maxScore: Number(form.maxScore),
              division: form.division === "BOTH" ? null : form.division,
              section: form.section,
              levelScored: form.levelScored,
            })
          }
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" className="h-9" disabled={readOnly || patch.isPending} onClick={() => patch.mutate({ isActive: !criterion.isActive })}>
          {criterion.isActive ? "Disable" : "Enable"}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-full">
        <Input
          className="h-8 max-w-md flex-1 text-xs"
          placeholder="Section on the score sheet (optional), e.g. Part A: Written Communication"
          value={form.section}
          disabled={readOnly}
          onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
          aria-label="Section"
        />
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={form.levelScored} disabled={readOnly} onChange={(e) => setForm((f) => ({ ...f, levelScored: e.target.checked }))} />
          Score by level (BE/AE/ME/EE)
        </label>
      </div>
    </div>
  );
}

function CriteriaCard({ edition, criteria, readOnly }: { edition: KsefEditionSummary; criteria: KsefCriterionRow[]; readOnly: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState({ name: "", maxScore: "", division: "BOTH" });
  const addMutation = useMutation({
    mutationFn: () =>
      apiPost("/api/ksef/criteria", {
        editionId: edition.id,
        name: form.name,
        maxScore: Number(form.maxScore),
        division: form.division === "BOTH" ? null : form.division,
      }),
    onSuccess: () => {
      toast.success("Criterion added");
      setForm({ name: "", maxScore: "", division: "BOTH" });
      queryClient.invalidateQueries({ queryKey: ["ksef-config", edition.id] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to add criterion"),
  });

  const juniorOnOfficialSheet = criteria.some(
    (c) => c.isActive && c.division === "JUNIOR_SCHOOL" && c.levelScored && c.section?.startsWith("Part A"),
  );
  const officialMutation = useMutation({
    mutationFn: () => apiPost<{ submittedOnOld: number }>("/api/ksef/criteria/official-junior", { editionId: edition.id }),
    onSuccess: ({ submittedOnOld }) => {
      toast.success("Junior School now uses the official KSEF score sheet (/65)");
      if (submittedOnOld > 0) {
        toast.warning(`${submittedOnOld} Junior School score sheet${submittedOnOld === 1 ? " was" : "s were"} already submitted on the old criteria - re-judge those projects so all their sheets match.`, { duration: 12_000 });
      }
      queryClient.invalidateQueries({ queryKey: ["ksef-config", edition.id] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to switch score sheet"),
  });
  async function switchToOfficial() {
    const { submitted } = await apiGet<{ submitted: number }>(`/api/ksef/criteria/official-junior?editionId=${edition.id}`);
    const warning =
      submitted > 0
        ? `\n\n${submitted} Junior School score sheet${submitted === 1 ? " has" : "s have"} already been submitted on the current criteria. They stay as they are, but those projects should be re-judged on the new sheet so their judges' totals are comparable.`
        : "";
    if (
      window.confirm(
        `Use the official KSEF Junior School score sheet (Part A /20, Part B /10, Part C /35 - 65 in all, scored BE/AE/ME/EE) for Junior School projects?\n\nThe current Junior School criteria are kept for the record but stop applying; criteria shared with Senior School become Senior-only.${warning}`,
      )
    ) {
      officialMutation.mutate();
    }
  }

  const totals = KSEF_DIVISIONS.map((d) => ({
    division: d,
    total: criteria.filter((c) => c.isActive && (c.division === null || c.division === d)).reduce((sum, c) => sum + c.maxScore, 0),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Judging criteria &amp; scoring</CardTitle>
        <CardDescription>
          Each judge scores every active criterion; a project&apos;s score is the average of its judges&apos; totals.
          Score sheet totals:{" "}
          {totals.map((t, i) => (
            <span key={t.division}>
              {i > 0 && " · "}
              {KSEF_DIVISION_LABELS[t.division]} <span className="font-semibold text-foreground">{t.total}</span>
            </span>
          ))}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!juniorOnOfficialSheet && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-overlay p-3 text-sm">
            <span>Junior School projects can use the official KSEF Junior School score sheet (Parts A, B and C - 65 marks, scored BE/AE/ME/EE).</span>
            <Button size="sm" disabled={readOnly || officialMutation.isPending} onClick={switchToOfficial}>
              Use official Junior School sheet
            </Button>
          </div>
        )}
        <div className="hidden gap-2 px-3 text-xs uppercase text-muted md:grid md:grid-cols-[1fr_1.4fr_90px_150px_auto]">
          <span>Criterion</span>
          <span>Description</span>
          <span>Max</span>
          <span>Applies to</span>
          <span />
        </div>
        {criteria.map((c) => (
          <CriterionEditor key={`${c.id}:${c.isActive}:${c.maxScore}:${c.name}:${c.section}:${c.levelScored}:${c.division}`} criterion={c} readOnly={readOnly} />
        ))}
        <div className="grid gap-2 rounded-md border border-dashed border-border p-3 md:grid-cols-[1fr_90px_150px_auto]">
          <Input className="h-9" placeholder="New criterion" value={form.name} disabled={readOnly} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input className="h-9 font-mono" placeholder="Max" inputMode="numeric" value={form.maxScore} disabled={readOnly} onChange={(e) => setForm((f) => ({ ...f, maxScore: e.target.value }))} />
          <Select value={form.division} onValueChange={(v) => setForm((f) => ({ ...f, division: v }))} disabled={readOnly}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BOTH">Both divisions</SelectItem>
              {KSEF_DIVISIONS.map((d) => (
                <SelectItem key={d} value={d}>
                  {KSEF_DIVISION_LABELS[d]} only
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-9" disabled={readOnly || !form.name.trim() || !Number(form.maxScore) || addMutation.isPending} onClick={() => addMutation.mutate()}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ConfigurationManager({ edition }: { edition: KsefEditionSummary }) {
  const readOnly = edition.status === "CLOSED";
  const { data, isLoading } = useQuery({
    queryKey: ["ksef-config", edition.id],
    queryFn: () => apiGet<{ categories: KsefCategoryRow[]; criteria: KsefCriterionRow[] }>(`/api/ksef/config?editionId=${edition.id}`),
  });

  if (isLoading || !data) return <p className="text-muted">Loading...</p>;

  return (
    <div className="space-y-6">
      {readOnly && <p className="text-sm text-muted">{edition.name} is closed - its configuration is read-only.</p>}
      <div className="grid gap-6 xl:grid-cols-2">
        {KSEF_DIVISIONS.map((division) => (
          <CategoriesCard
            key={division}
            edition={edition}
            division={division}
            readOnly={readOnly}
            categories={data.categories.filter((c) => c.division === division)}
          />
        ))}
      </div>
      <CriteriaCard edition={edition} criteria={data.criteria} readOnly={readOnly} />
    </div>
  );
}
