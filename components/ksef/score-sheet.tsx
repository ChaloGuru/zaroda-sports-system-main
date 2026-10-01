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
import { KSEF_DIVISION_LABELS } from "@/lib/ksef-config";
import { LEVEL_LABELS } from "@/lib/utils";
import type { KsefDivision, Level } from "@prisma/client";

interface ScoreSheetData {
  assignment: { id: string; level: Level; comment: string | null; submittedAt: string | null };
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
  criteria: { id: string; name: string; description: string | null; maxScore: number }[];
  scores: { criterionId: string; score: number }[];
}

function SheetForm({ data, backHref }: { data: ScoreSheetData; backHref: string }) {
  const queryClient = useQueryClient();
  const locked = !!data.assignment.submittedAt;
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(data.scores.map((s) => [s.criterionId, String(s.score)])),
  );
  const [comment, setComment] = React.useState(data.assignment.comment ?? "");

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
            <CardDescription>Score each criterion out of its maximum. Saving keeps a draft; submitting locks the sheet.</CardDescription>
          </div>
          {locked ? (
            <Badge variant="success" className="gap-1">
              <Lock className="h-3 w-3" /> Submitted
            </Badge>
          ) : (
            <Badge variant="warning">Not submitted</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {data.criteria.length === 0 && <p className="text-muted">No judging criteria are configured for this division yet.</p>}
          {parsed.map(({ criterion, invalid }) => (
            <div key={criterion.id} className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-foreground">{criterion.name}</p>
                {criterion.description && <p className="text-xs text-muted">{criterion.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  aria-label={`${criterion.name} score`}
                  inputMode="decimal"
                  className={`h-10 w-24 text-center font-mono tabular-nums ${invalid ? "border-destructive" : ""}`}
                  value={values[criterion.id] ?? ""}
                  disabled={locked}
                  onChange={(e) => setValues((v) => ({ ...v, [criterion.id]: e.target.value }))}
                />
                <span className="w-12 text-sm text-muted">/ {criterion.maxScore}</span>
              </div>
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
