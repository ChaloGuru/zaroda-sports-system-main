"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, CheckCircle2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet, apiPost } from "@/lib/api-client";
import { KSEF_DIVISION_LABELS } from "@/lib/ksef-config";
import { LEVEL_LABELS } from "@/lib/utils";
import { CaseTimeline, type CaseEvent } from "./case-timeline";
import type { KsefDivision, Level } from "@prisma/client";

interface ReviewData {
  review: {
    id: string;
    level: Level;
    status: "OPEN" | "APPROVED";
    spread: number;
    threshold: number;
    basis: "POINTS" | "PERCENT";
    finalScoreBasis: "AVERAGE_OF_JUDGES" | "CHIEF_JUDGE_DETERMINED" | null;
    finalScore: number | null;
    approvedAt: string | null;
  };
  editionClosed: boolean;
  project: {
    code: string | null;
    title: string;
    abstract: string | null;
    documentUrl: string | null;
    category: { name: string; division: KsefDivision };
    subCategory: { name: string } | null;
    school: { name: string; subcounty: string; county: string };
    learners: { firstName: string; lastName: string }[];
  };
  criteria: { id: string; name: string; maxScore: number }[];
  maxTotal: number;
  sheets: {
    id: string;
    judgeName: string;
    specialty: string | null;
    submittedAt: string | null;
    comment: string | null;
    scores: { criterionId: string; score: number }[];
    total: number | null;
  }[];
  averageOfJudges: number | null;
  events: CaseEvent[];
}

function ActionsCard({ data }: { data: ReviewData }) {
  const queryClient = useQueryClient();
  const [note, setNote] = React.useState("");
  const [basis, setBasis] = React.useState<"AVERAGE_OF_JUDGES" | "CHIEF_JUDGE_DETERMINED">("AVERAGE_OF_JUDGES");
  const [finalScore, setFinalScore] = React.useState("");
  const { review } = data;

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost(`/api/ksef/reviews/${review.id}`, body),
    onSuccess: (_d, body) => {
      toast.success({ NOTE: "Note recorded", APPROVE: "Final result approved", REOPEN: "Review reopened" }[body.action as string] ?? "Saved");
      setNote("");
      setFinalScore("");
      queryClient.invalidateQueries({ queryKey: ["ksef-review", review.id] });
      queryClient.invalidateQueries({ queryKey: ["ksef-reviews"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Action failed"),
  });

  if (data.editionClosed) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chief Judge review</CardTitle>
        <CardDescription>
          Judges&apos; original scores stay exactly as submitted. Your note and decision are recorded alongside them in the
          permanent history.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>{review.status === "OPEN" ? "Review / resolution note" : "Note"}</Label>
          <Textarea className="mt-1.5" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        {review.status === "OPEN" ? (
          <>
            <div className="space-y-2">
              <Label>Final result</Label>
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" className="mt-1" checked={basis === "AVERAGE_OF_JUDGES"} onChange={() => setBasis("AVERAGE_OF_JUDGES")} />
                <span>
                  Approve the average of all submitted judge totals
                  <span className="ml-1 font-mono font-semibold">({data.averageOfJudges ?? "-"})</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" className="mt-1" checked={basis === "CHIEF_JUDGE_DETERMINED"} onChange={() => setBasis("CHIEF_JUDGE_DETERMINED")} />
                <span>Approve a final score I have determined (justify it in the note)</span>
              </label>
              {basis === "CHIEF_JUDGE_DETERMINED" && (
                <div className="flex items-center gap-2 pl-6">
                  <Input className="h-9 w-28 font-mono" inputMode="decimal" value={finalScore} onChange={(e) => setFinalScore(e.target.value)} />
                  <span className="text-sm text-muted">/ {data.maxTotal}</span>
                </div>
              )}
              <p className="text-xs text-muted">
                If the discrepancy needs another opinion, ask the KSEF administrator to assign an additional judge - their
                sheet will be added to this review when submitted.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!note.trim() || mutation.isPending} onClick={() => mutation.mutate({ action: "NOTE", note })}>
                Record note only
              </Button>
              <Button
                disabled={!note.trim() || mutation.isPending || (basis === "CHIEF_JUDGE_DETERMINED" && finalScore.trim() === "")}
                onClick={() =>
                  confirm("Approve this final result? It will be recorded with your name and note.") &&
                  mutation.mutate({
                    action: "APPROVE",
                    note,
                    finalScoreBasis: basis,
                    ...(basis === "CHIEF_JUDGE_DETERMINED" ? { finalScore: Number(finalScore) } : {}),
                  })
                }
              >
                <CheckCircle2 className="h-4 w-4" /> Approve final result
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!note.trim() || mutation.isPending} onClick={() => mutation.mutate({ action: "NOTE", note })}>
              Record note
            </Button>
            <Button
              variant="secondary"
              disabled={!note.trim() || mutation.isPending}
              onClick={() =>
                confirm("Reopen this review? The approved final result will be set aside (it stays in the history). If the result is published, it will be withdrawn until re-published.") &&
                mutation.mutate({ action: "REOPEN", note })
              }
            >
              Reopen review
            </Button>
            <p className="w-full text-xs text-muted">Give the reason for reopening in the note. Published results can only be reopened by the KSEF administrator.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** The Chief Judge's view of one flagged project. */
export function ReviewDetail({ reviewId, backHref }: { reviewId: string; backHref: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["ksef-review", reviewId],
    queryFn: () => apiGet<ReviewData>(`/api/ksef/reviews/${reviewId}`),
    retry: false,
  });
  if (isLoading) return <p className="text-muted">Loading...</p>;
  if (error || !data) return <p className="text-destructive">{error instanceof Error ? error.message : "Couldn't load this review"}</p>;

  const { review, project, sheets, criteria } = data;
  const submitted = sheets.filter((s) => s.submittedAt);
  const pending = sheets.filter((s) => !s.submittedAt);
  const totals = submitted.map((s) => s.total ?? 0);
  const high = Math.max(...totals);
  const low = Math.min(...totals);

  return (
    <div className="space-y-6">
      <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      {review.status === "OPEN" ? (
        <div className="flex items-start gap-3 rounded-md border border-[#B45309]/40 bg-[#FBF2DC] p-4 text-[#8A6412]">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold">⚠️ JUDGING DISCREPANCY — CHIEF JUDGE REVIEW</p>
            <p className="text-sm">
              Judge totals differ by {review.spread} marks, above this edition&apos;s threshold of {review.threshold}
              {review.basis === "PERCENT" ? "% of the maximum total" : " marks"}. The {LEVEL_LABELS[review.level]} result for this
              project can&apos;t be published until a Chief Judge approves it.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-md border border-[#12805C]/40 bg-[#E7F6EF] p-4 text-[#12805C]">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm">
            Final result approved: <span className="font-mono font-bold">{review.finalScore}</span> (
            {review.finalScoreBasis === "AVERAGE_OF_JUDGES" ? "average of judges' totals" : "determined by the Chief Judge"}).
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {project.code && <span className="font-mono text-primary">{project.code}</span>}
            {project.title}
          </CardTitle>
          <CardDescription>
            {KSEF_DIVISION_LABELS[project.category.division]} · {project.category.name}
            {project.subCategory ? ` / ${project.subCategory.name}` : ""} · {project.school.name} ({project.school.subcounty},{" "}
            {project.school.county}) · {LEVEL_LABELS[review.level]}
          </CardDescription>
        </CardHeader>
        {project.documentUrl && (
          <CardContent>
            <a href={project.documentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary underline">
              <FileText className="h-4 w-4" /> Project report
            </a>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Individual judges&apos; scores (as submitted)</CardTitle>
          <CardDescription>
            Original, unaltered score sheets. Highest and lowest totals are highlighted.
            {pending.length > 0 && ` ${pending.length} assigned judge${pending.length === 1 ? " hasn't" : "s haven't"} submitted yet: ${pending.map((p) => p.judgeName).join(", ")}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Criterion</TableHead>
                {submitted.map((s) => (
                  <TableHead key={s.id} className="text-center">
                    {s.judgeName}
                    {s.specialty && <span className="block text-xs font-normal text-muted">{s.specialty}</span>}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {criteria.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    {c.name} <span className="text-xs text-muted">/ {c.maxScore}</span>
                  </TableCell>
                  {submitted.map((s) => (
                    <TableCell key={s.id} className="text-center font-mono tabular-nums">
                      {s.scores.find((x) => x.criterionId === c.id)?.score ?? "-"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold">Total / {data.maxTotal}</TableCell>
                {submitted.map((s) => (
                  <TableCell key={s.id} className="text-center">
                    <span
                      className={`font-mono text-base font-bold tabular-nums ${totals.length > 1 && (s.total === high || s.total === low) ? "rounded bg-[#FBF2DC] px-1.5 text-[#8A6412]" : ""}`}
                    >
                      {s.total}
                    </span>
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
          <p className="mt-3 text-sm text-muted">
            Average of judges&apos; totals: <span className="font-mono font-semibold text-foreground">{data.averageOfJudges ?? "-"}</span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Judges&apos; comments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {submitted.map((s) => (
            <div key={s.id} className="rounded-md border border-border p-3">
              <p className="text-sm font-semibold text-foreground">
                {s.judgeName}
                <Badge variant="outline" className="ml-2">
                  submitted {s.submittedAt ? new Date(s.submittedAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" }) : ""}
                </Badge>
              </p>
              <p className="mt-1 whitespace-pre-line text-sm text-foreground">{s.comment || <span className="text-muted">No comment.</span>}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <ActionsCard key={`${review.status}:${data.events.length}`} data={data} />
      <CaseTimeline events={data.events} />
    </div>
  );
}
