"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, FileText, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPut } from "@/lib/api-client";
import { KSEF_DIVISION_LABELS, KSEF_SCORE_LEVELS, levelScores } from "@/lib/ksef-config";
import { LEVEL_LABELS, cn } from "@/lib/utils";
import type { KsefDivision, Level } from "@prisma/client";

interface ScoreSheetData {
  assignment: { id: string; level: Level; comment: string | null; submittedAt: string | null };
  /** Only the assigned judge, before submitting. Everyone else (admin, Chief Judge) sees it read-only. */
  canEdit: boolean;
  /** False while the edition is still a Draft (or closed). */
  judgingOpen: boolean;
  project: {
    code: string | null;
    title: string;
    abstract: string | null;
    documentUrl: string | null;
    category: { name: string; division: KsefDivision };
    subCategory: { name: string } | null;
    school: { name: string };
    learners: { firstName: string; lastName: string; grade: string | null }[];
  };
  criteria: { id: string; name: string; description: string | null; maxScore: number; section: string | null; levelScored: boolean }[];
  scores: { criterionId: string; score: number }[];
}

function SheetForm({ data, backHref }: { data: ScoreSheetData; backHref: string }) {
  const queryClient = useQueryClient();
  const locked = !data.canEdit;
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(data.scores.map((s) => [s.criterionId, String(s.score)])),
  );
  const [comment, setComment] = React.useState(data.assignment.comment ?? "");
  // Which criterion last had a keystroke refused (shown under its box).
  const [refused, setRefused] = React.useState<{ criterionId: string; message: string } | null>(null);

  // Locks each box to 0..max with at most 2 decimals: a keystroke that would
  // take it outside that range is refused rather than accepted and flagged.
  function enterScore(criterionId: string, maxScore: number, raw: string) {
    const value = raw.trim();
    if (value !== "" && !/^\d*\.?\d{0,2}$/.test(value)) {
      setRefused({ criterionId, message: "Numbers only, up to 2 decimal places" });
      return;
    }
    if (value !== "" && value !== "." && Number(value) > maxScore) {
      setRefused({ criterionId, message: `The maximum for this criterion is ${maxScore}` });
      return;
    }
    setRefused(null);
    setValues((v) => ({ ...v, [criterionId]: value }));
  }

  const parsed = data.criteria.map((c) => {
    const raw = values[c.id]?.trim() ?? "";
    const n = raw === "" ? null : Number(raw);
    const invalid = n !== null && (!Number.isFinite(n) || n < 0 || n > c.maxScore);
    return { criterion: c, value: n, invalid };
  });
  const total = parsed.reduce((sum, p) => sum + (p.value !== null && !p.invalid ? p.value : 0), 0);
  const maxTotal = data.criteria.reduce((sum, c) => sum + c.maxScore, 0);
  const complete = parsed.every((p) => p.value !== null && !p.invalid);
  const anyInvalid = parsed.some((p) => p.invalid);
  const anyLevelScored = data.criteria.some((c) => c.levelScored);
  // Consecutive criteria with the same section form one block on the sheet.
  const sections = parsed.reduce<{ title: string | null; rows: typeof parsed }[]>((acc, row) => {
    const last = acc[acc.length - 1];
    if (last && last.title === row.criterion.section) last.rows.push(row);
    else acc.push({ title: row.criterion.section, rows: [row] });
    return acc;
  }, []);
  const sum = (rows: typeof parsed) => Math.round(rows.reduce((s, r) => s + (r.value !== null && !r.invalid ? r.value : 0), 0) * 100) / 100;

  const saveMutation = useMutation({
    mutationFn: (submit: boolean) =>
      apiPut(`/api/ksef/assignments/${data.assignment.id}`, {
        scores: parsed.filter((p) => p.value !== null).map((p) => ({ criterionId: p.criterion.id, score: p.value })),
        comment,
        submit,
      }),
    onSuccess: (_d, submit) => {
      toast.success(submit ? "Score sheet submitted" : "Draft saved");
      queryClient.invalidateQueries({ queryKey: ["ksef-score-sheet", data.assignment.id] });
      queryClient.invalidateQueries({ queryKey: ["ksef-my-assignments"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to save scores"),
  });

  const p = data.project;
  return (
    <div className="space-y-6">
      <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to projects
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {p.code && <span className="font-mono text-primary">{p.code}</span>}
            {p.title}
          </CardTitle>
          <CardDescription>
            {KSEF_DIVISION_LABELS[p.category.division]} · {p.category.name}
            {p.subCategory ? ` / ${p.subCategory.name}` : ""} · {LEVEL_LABELS[data.assignment.level]} level
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted">
            {p.school.name} · Presented by {p.learners.map((l) => `${l.firstName} ${l.lastName}${l.grade ? ` (${l.grade})` : ""}`).join(", ")}
          </p>
          {p.abstract && <p className="whitespace-pre-line text-foreground">{p.abstract}</p>}
          {p.documentUrl && (
            <a href={p.documentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline">
              <FileText className="h-4 w-4" /> Read the project report
            </a>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Score sheet</CardTitle>
            <CardDescription>
              {data.canEdit
                ? "Score each criterion out of its maximum on your own - you won't see other judges' scores. Saving keeps a draft; once submitted, your scores are permanent and can't be changed by anyone."
                : !data.judgingOpen && !data.assignment.submittedAt
                  ? "Judging hasn't opened yet - it opens once the KSEF administrator activates this edition."
                  : "Read-only view of this judge's original score sheet."}
            </CardDescription>
          </div>
          {data.assignment.submittedAt ? (
            <Badge variant="success" className="gap-1">
              <Lock className="h-3 w-3" /> Submitted
            </Badge>
          ) : (
            <Badge variant="warning">Not submitted</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {data.criteria.length === 0 && <p className="text-muted">No judging criteria are configured for this division yet.</p>}
          {anyLevelScored && (
            <p className="rounded-md bg-surface-overlay px-3 py-2 text-xs text-muted">
              {KSEF_SCORE_LEVELS.map((l) => `${l.code} = ${l.label}`).join(" · ")}. Each level earns 25%, 50%, 75% or 100% of the
              criterion&apos;s maximum.
            </p>
          )}
          {sections.map((section, sectionIndex) => (
            <div key={`${section.title ?? "criteria"}-${sectionIndex}`} className="space-y-2">
              {section.title && (
                <div className="flex items-center justify-between gap-3 border-b border-border pb-1 pt-2">
                  <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-foreground">{section.title}</h3>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-muted">
                    {sum(section.rows)} / {section.rows.reduce((s, r) => s + r.criterion.maxScore, 0)}
                  </span>
                </div>
              )}
              {section.rows.map(({ criterion, invalid }) => (
                <div key={criterion.id} className="flex flex-col gap-2 rounded-md border border-border p-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {criterion.name} <span className="text-sm font-normal text-muted">(/{criterion.maxScore})</span>
                    </p>
                    {criterion.description && <p className="text-xs text-muted">{criterion.description}</p>}
                  </div>
                  {criterion.levelScored ? (
                    <div className="flex shrink-0 flex-wrap gap-1.5" role="radiogroup" aria-label={`${criterion.name} level`}>
                      {levelScores(criterion.maxScore).map((level) => {
                        const chosen = values[criterion.id] !== undefined && values[criterion.id] !== "" && Number(values[criterion.id]) === level.score;
                        return (
                          <button
                            key={level.code}
                            type="button"
                            role="radio"
                            aria-checked={chosen}
                            title={`${level.label} - ${level.score}`}
                            disabled={locked}
                            onClick={() => setValues((v) => ({ ...v, [criterion.id]: String(level.score) }))}
                            className={cn(
                              "flex min-w-[3.75rem] flex-col items-center rounded-md border px-2 py-1 text-xs transition-colors disabled:cursor-not-allowed",
                              chosen
                                ? "border-primary bg-primary text-white"
                                : "border-border text-foreground hover:border-primary disabled:opacity-60",
                            )}
                          >
                            <span className="font-bold">{level.code}</span>
                            <span className="font-mono tabular-nums">{level.score}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        <Input
                          aria-label={`${criterion.name} score, out of ${criterion.maxScore}`}
                          inputMode="decimal"
                          className={`h-10 w-24 text-center font-mono tabular-nums ${invalid ? "border-destructive" : ""}`}
                          value={values[criterion.id] ?? ""}
                          disabled={locked}
                          onChange={(e) => enterScore(criterion.id, criterion.maxScore, e.target.value)}
                        />
                        <span className="w-12 text-sm text-muted">/ {criterion.maxScore}</span>
                      </div>
                      {refused?.criterionId === criterion.id && (
                        <p role="alert" className="text-xs font-medium text-destructive">
                          {refused.message}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
          <div className="flex items-center justify-between rounded-md bg-surface-overlay px-4 py-3">
            <span className="font-semibold text-foreground">Total</span>
            <span className="font-mono text-xl font-bold tabular-nums text-foreground">
              {Math.round(total * 100) / 100} <span className="text-sm font-normal text-muted">/ {maxTotal}</span>
            </span>
          </div>
          <div>
            <Label>Comments (optional)</Label>
            <Textarea className="mt-1.5" rows={3} value={comment} disabled={locked} onChange={(e) => setComment(e.target.value)} />
          </div>
          {!locked && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={anyInvalid || saveMutation.isPending} onClick={() => saveMutation.mutate(false)}>
                Save draft
              </Button>
              <Button
                disabled={!complete || data.criteria.length === 0 || saveMutation.isPending}
                onClick={() => confirm("Submit this score sheet? You won't be able to change it afterwards.") && saveMutation.mutate(true)}
              >
                Submit scores
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** One judge's score sheet for one assigned project. */
export function ScoreSheet({ assignmentId, backHref }: { assignmentId: string; backHref: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["ksef-score-sheet", assignmentId],
    queryFn: () => apiGet<ScoreSheetData>(`/api/ksef/assignments/${assignmentId}`),
    retry: false,
  });
  if (isLoading) return <p className="text-muted">Loading...</p>;
  if (error || !data) return <p className="text-destructive">{error instanceof Error ? error.message : "Couldn't load this score sheet"}</p>;
  return <SheetForm key={data.assignment.submittedAt ?? "draft"} data={data} backHref={backHref} />;
}
