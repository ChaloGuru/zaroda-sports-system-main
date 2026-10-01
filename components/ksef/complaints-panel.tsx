"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, MessageSquareWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, apiGet, apiPost } from "@/lib/api-client";
import { LEVEL_LABELS } from "@/lib/utils";
import { CaseTimeline, type CaseEvent } from "./case-timeline";
import type { Level } from "@prisma/client";

type ComplaintStatus = "SUBMITTED" | "UNDER_REVIEW" | "UPHELD" | "DISMISSED";

interface ComplaintRow {
  id: string;
  level: Level;
  complainantName: string;
  complainantRole: string;
  subject: string;
  status: ComplaintStatus;
  createdAt: string;
  raisedBy: { name: string };
  project: { code: string | null; title: string; school: { name: string } };
}

interface ComplaintDetail {
  complaint: ComplaintRow & {
    details: string;
    documentUrl: string | null;
    decision: string | null;
    decidedAt: string | null;
    decidedBy: { name: string } | null;
    project: ComplaintRow["project"] & { category: { name: string } };
  };
  events: CaseEvent[];
  permissions: { canNote: boolean; canDecide: boolean; canReopen: boolean; conflicted: boolean };
}

const STATUS_BADGE: Record<ComplaintStatus, "outline" | "warning" | "success" | "secondary"> = {
  SUBMITTED: "outline",
  UNDER_REVIEW: "warning",
  UPHELD: "success",
  DISMISSED: "secondary",
};
const STATUS_LABEL: Record<ComplaintStatus, string> = {
  SUBMITTED: "submitted",
  UNDER_REVIEW: "under SRC review",
  UPHELD: "upheld",
  DISMISSED: "dismissed",
};

function RaiseComplaintDialog({ editionId, open, onOpenChange }: { editionId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["ksef-competing-projects", editionId],
    queryFn: () =>
      apiGet<{ projects: { id: string; code: string | null; title: string; school: { name: string }; levels: Level[] }[] }>(
        `/api/ksef/competing-projects?editionId=${editionId}`,
      ),
    enabled: open,
  });
  const [form, setForm] = React.useState({ projectId: "", level: "", complainantName: "", complainantRole: "", subject: "", details: "", documentUrl: "" });
  const [uploading, setUploading] = React.useState(false);
  const project = data?.projects.find((p) => p.id === form.projectId);

  const raise = useMutation({
    mutationFn: () => apiPost("/api/ksef/complaints", { editionId, ...form }),
    onSuccess: () => {
      toast.success("Complaint recorded for the SRC");
      queryClient.invalidateQueries({ queryKey: ["ksef-complaints", editionId] });
      onOpenChange(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to record complaint"),
  });

  async function upload(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/ksef/complaints/upload", { method: "POST", body });
      const json = await response.json();
      if (!response.ok) throw new ApiError(json.error ?? "Upload failed", response.status);
      setForm((f) => ({ ...f, documentUrl: json.url }));
      toast.success("Written complaint attached");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload");
    } finally {
      setUploading(false);
    }
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Raise complaint / review request</DialogTitle>
          <DialogDescription>
            Complaints go to the Scientific Review Committee (SRC) and must be made in writing. Recording a complaint doesn&apos;t
            change any score or result.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <div>
              <Label>Project</Label>
              <Select value={form.projectId} onValueChange={(v) => setForm((f) => ({ ...f, projectId: v, level: "" }))}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {(data?.projects ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code} - {p.title} ({p.school.name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Level</Label>
              <Select value={form.level} onValueChange={(v) => setForm((f) => ({ ...f, level: v }))} disabled={!project}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Level" />
                </SelectTrigger>
                <SelectContent>
                  {(project?.levels ?? []).map((l) => (
                    <SelectItem key={l} value={l}>
                      {LEVEL_LABELS[l]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Complainant&apos;s name</Label>
              <Input className="mt-1.5" value={form.complainantName} onChange={set("complainantName")} />
            </div>
            <div>
              <Label>Complainant&apos;s role</Label>
              <Input className="mt-1.5" placeholder="e.g. Patron, Head of Institution, Judge" value={form.complainantRole} onChange={set("complainantRole")} />
            </div>
          </div>
          <div>
            <Label>Subject</Label>
            <Input className="mt-1.5" value={form.subject} onChange={set("subject")} />
          </div>
          <div>
            <Label>Written complaint</Label>
            <Textarea className="mt-1.5" rows={6} placeholder="Set out the complaint in full, as made in writing." value={form.details} onChange={set("details")} />
          </div>
          <div>
            <Label>Scan of the written complaint (PDF, optional)</Label>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <Input type="file" accept="application/pdf" className="max-w-xs" disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              {form.documentUrl && (
                <a href={form.documentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-primary underline">
                  <FileText className="h-4 w-4" /> Attached
                </a>
              )}
            </div>
          </div>
          <Button
            className="w-full"
            disabled={
              raise.isPending ||
              uploading ||
              !form.projectId ||
              !form.level ||
              !form.complainantName.trim() ||
              !form.complainantRole.trim() ||
              !form.subject.trim() ||
              !form.details.trim()
            }
            onClick={() => raise.mutate()}
          >
            Record complaint
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ComplaintDialog({ complaintId, onOpenChange }: { complaintId: string; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["ksef-complaint", complaintId],
    queryFn: () => apiGet<ComplaintDetail>(`/api/ksef/complaints/${complaintId}`),
  });
  const [note, setNote] = React.useState("");
  const [decision, setDecision] = React.useState("");

  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost(`/api/ksef/complaints/${complaintId}`, body),
    onSuccess: () => {
      toast.success("Recorded");
      setNote("");
      setDecision("");
      queryClient.invalidateQueries({ queryKey: ["ksef-complaint", complaintId] });
      queryClient.invalidateQueries({ queryKey: ["ksef-complaints"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Action failed"),
  });

  const c = data?.complaint;
  const p = data?.permissions;
  const decided = c?.status === "UPHELD" || c?.status === "DISMISSED";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        {isLoading || !c || !p ? (
          <p className="text-muted">Loading...</p>
        ) : (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {c.subject}
                <Badge variant={STATUS_BADGE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
              </DialogTitle>
              <DialogDescription>
                {c.project.code} - {c.project.title} · {c.project.school.name} · {LEVEL_LABELS[c.level]}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border border-border p-3 text-sm">
              <p className="text-muted">
                From {c.complainantName} ({c.complainantRole}) · recorded by {c.raisedBy.name} on{" "}
                {new Date(c.createdAt).toLocaleDateString("en-KE", { dateStyle: "medium" })}
              </p>
              <p className="mt-2 whitespace-pre-line text-foreground">{c.details}</p>
              {c.documentUrl && (
                <a href={c.documentUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-primary underline">
                  <FileText className="h-4 w-4" /> Written complaint (PDF)
                </a>
              )}
            </div>

            {decided && (
              <div className="rounded-md border border-border bg-surface-raised p-3 text-sm">
                <p className="font-semibold text-foreground">
                  SRC decision: {STATUS_LABEL[c.status]}
                  {c.decidedBy ? ` - ${c.decidedBy.name}` : ""}
                </p>
                <p className="mt-1 whitespace-pre-line">{c.decision}</p>
              </div>
            )}

            {p.conflicted && <p className="text-sm text-muted">You&apos;re judging this project, so you can&apos;t decide this complaint.</p>}

            {p.canNote && (
              <div className="space-y-2">
                <Label>Note</Label>
                <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={!note.trim() || act.isPending} onClick={() => act.mutate({ action: "NOTE", note })}>
                    Add note
                  </Button>
                  {p.canDecide && c.status === "SUBMITTED" && (
                    <Button size="sm" variant="secondary" disabled={act.isPending} onClick={() => act.mutate({ action: "START_REVIEW", note })}>
                      Take up for SRC review
                    </Button>
                  )}
                  {p.canReopen && decided && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!note.trim() || act.isPending}
                      onClick={() => confirm("Reopen this decided complaint? Give the reason in the note.") && act.mutate({ action: "REOPEN", note })}
                    >
                      Reopen complaint
                    </Button>
                  )}
                </div>
              </div>
            )}

            {p.canDecide && !decided && (
              <div className="space-y-2 rounded-md border border-border p-3">
                <Label>SRC decision (in writing)</Label>
                <Textarea rows={4} value={decision} onChange={(e) => setDecision(e.target.value)} />
                <p className="text-xs text-muted">
                  A decision doesn&apos;t change any score. If action is needed, it&apos;s taken through the Chief Judge review or by
                  assigning additional judges - each recorded in its own history.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" disabled={!decision.trim() || act.isPending} onClick={() => confirm("Record this complaint as UPHELD?") && act.mutate({ action: "DECIDE", outcome: "UPHELD", decision })}>
                    Uphold
                  </Button>
                  <Button size="sm" variant="secondary" disabled={!decision.trim() || act.isPending} onClick={() => confirm("Record this complaint as DISMISSED?") && act.mutate({ action: "DECIDE", outcome: "DISMISSED", decision })}>
                    Dismiss
                  </Button>
                </div>
              </div>
            )}

            <CaseTimeline events={data.events} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Written complaints / review requests for the SRC. */
export function ComplaintsPanel({ editionId, canRaise }: { editionId: string; canRaise: boolean }) {
  const [raising, setRaising] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["ksef-complaints", editionId],
    queryFn: () => apiGet<{ complaints: ComplaintRow[] }>(`/api/ksef/complaints?editionId=${editionId}`),
  });
  const complaints = data?.complaints ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Complaints &amp; review requests</CardTitle>
          <CardDescription>
            Raised in writing and decided by the Scientific Review Committee (SRC). Scores are never changed silently - every
            step is on the record.
          </CardDescription>
        </div>
        {canRaise && (
          <Button onClick={() => setRaising(true)}>
            <MessageSquareWarning className="h-4 w-4" /> Raise Complaint / Review
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <p className="text-muted">Loading...</p>}
        {!isLoading && complaints.length === 0 && <p className="text-muted">No complaints recorded.</p>}
        {complaints.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setOpenId(c.id)}
            className="flex w-full items-center justify-between gap-3 rounded-md border border-border p-3 text-left transition-colors hover:border-primary/50"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{c.subject}</p>
              <p className="text-sm text-muted">
                {c.project.code} · {c.project.school.name} · {LEVEL_LABELS[c.level]} · from {c.complainantName} ({c.complainantRole}) ·{" "}
                {new Date(c.createdAt).toLocaleDateString("en-KE", { dateStyle: "medium" })}
              </p>
            </div>
            <Badge variant={STATUS_BADGE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
          </button>
        ))}
      </CardContent>
      {raising && <RaiseComplaintDialog editionId={editionId} open onOpenChange={setRaising} />}
      {openId && <ComplaintDialog key={openId} complaintId={openId} onOpenChange={(o) => !o && setOpenId(null)} />}
    </Card>
  );
}
