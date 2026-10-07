"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SanitizedHtml } from "@/components/sanitized-html";
import { FileText, Pencil, Trash2, X } from "lucide-react";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { formatDate, LEVEL_LABELS } from "@/lib/utils";

const LEVELS = ["BASE", "ZONE", "SUB_COUNTY", "COUNTY", "REGIONAL", "NATIONAL"];

interface CircularRow {
  id: string;
  title: string;
  content: string;
  senderName: string;
  targetLevel: string;
  documentUrl: string | null;
  createdAt: string;
}

const EMPTY_FORM = { title: "", content: "", senderName: "National Admin", targetLevel: "NATIONAL" };

/** "…/circulars/1730000000000-Fixtures-a1B2c3.pdf" -> "Fixtures-a1B2c3.pdf", for showing the current attachment. */
function fileNameOf(url: string): string {
  const last = decodeURIComponent(url.split("/").pop() ?? "PDF");
  return last.replace(/^\d+-/, "");
}

function CircularComposer() {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState(EMPTY_FORM);
  // The circular being edited, or null when writing a new one.
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [documentUrl, setDocumentUrl] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { data } = useQuery({
    queryKey: ["admin-circulars"],
    queryFn: () => apiGet<{ circulars: CircularRow[] }>("/api/circulars"),
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Larger uploads are refused by Vercel before they reach the server.
    if (file.size > 4 * 1024 * 1024) {
      toast.error("PDF must be smaller than 4 MB - compress it or split it into parts");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/circulars/upload", { method: "POST", body });
      const json = await response.json();
      if (!response.ok) throw new ApiError(json.error ?? "Upload failed", response.status);
      setDocumentUrl(json.url);
      setFileName(file.name);
      toast.success("PDF attached");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload PDF");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeAttachment() {
    setDocumentUrl(null);
    setFileName(null);
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    removeAttachment();
  }

  function startEditing(c: CircularRow) {
    setEditingId(c.id);
    setForm({ title: c.title, content: c.content, senderName: c.senderName, targetLevel: c.targetLevel });
    setDocumentUrl(c.documentUrl);
    setFileName(c.documentUrl ? fileNameOf(c.documentUrl) : null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const sendMutation = useMutation({
    mutationFn: () => {
      const fields = {
        title: form.title,
        content: form.content,
        senderName: form.senderName,
        targetLevel: form.targetLevel,
      };
      return editingId
        ? apiPatch(`/api/circulars/${editingId}`, { ...fields, documentUrl: documentUrl ?? null })
        : apiPost("/api/circulars", { ...fields, senderRole: "National Admin", isPublished: true, documentUrl: documentUrl ?? undefined });
    },
    onSuccess: () => {
      toast.success(editingId ? "Circular updated" : "Circular published");
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["admin-circulars"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to save circular"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/circulars/${id}`),
    onSuccess: (_data, id) => {
      toast.success("Circular deleted");
      if (id === editingId) resetForm();
      queryClient.invalidateQueries({ queryKey: ["admin-circulars"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to delete circular"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{editingId ? "Edit circular" : "Circulars"}</CardTitle>
        <CardDescription>
          {editingId ? "Change it, then save - tenants see the updated version." : "Broadcast to all tenants, or target a specific competition level."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Content</Label>
          <Textarea rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Sender name</Label>
            <Input value={form.senderName} onChange={(e) => setForm({ ...form, senderName: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Target level</Label>
            <Select value={form.targetLevel} onValueChange={(targetLevel) => setForm({ ...form, targetLevel })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level === "NATIONAL" ? "All Tenants (National)" : LEVEL_LABELS[level as keyof typeof LEVEL_LABELS] ?? level.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Attachment (PDF, optional)</Label>
          {fileName ? (
            <div className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
              <span className="flex items-center gap-2 text-foreground">
                <FileText className="h-4 w-4 text-primary" /> {fileName}
              </span>
              <Button type="button" variant="ghost" size="icon" onClick={removeAttachment}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFileChange} disabled={uploading} />
          )}
          {uploading && <p className="text-xs text-muted">Uploading...</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={!form.title || !form.content || uploading || sendMutation.isPending}
          >
            {sendMutation.isPending ? "Saving..." : editingId ? "Save changes" : "Publish Circular"}
          </Button>
          {editingId && (
            <Button variant="ghost" onClick={resetForm}>
              Cancel
            </Button>
          )}
        </div>

        <div className="space-y-2 pt-2">
          <p className="text-sm font-medium text-foreground">Published circulars</p>
          {(data?.circulars ?? []).slice(0, 20).map((c) => (
            <div key={c.id} className={`rounded-md border p-3 ${c.id === editingId ? "border-primary" : "border-border"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{c.title}</p>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge variant="outline">{c.targetLevel.replace("_", " ")}</Badge>
                  <Button size="icon" variant="ghost" aria-label="Edit circular" onClick={() => startEditing(c)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Delete circular"
                    disabled={deleteMutation.isPending}
                    onClick={() => window.confirm(`Delete the circular "${c.title}"? Tenants will no longer see it.`) && deleteMutation.mutate(c.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted">{formatDate(c.createdAt)}</p>
              <div className="mt-1 text-sm text-muted line-clamp-2">
                <SanitizedHtml html={c.content} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function BroadcastMessageComposer() {
  const [form, setForm] = React.useState({ subject: "", body: "" });

  const sendMutation = useMutation({
    mutationFn: () => apiPost("/api/messages", { subject: form.subject, body: form.body, isBroadcast: true }),
    onSuccess: () => {
      toast.success("Broadcast message sent to all tenants");
      setForm({ subject: "", body: "" });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to send message"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Broadcast Message</CardTitle>
        <CardDescription>Sends directly to every tenant's message inbox.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Subject</Label>
          <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Message</Label>
          <Textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        </div>
        <Button onClick={() => sendMutation.mutate()} disabled={!form.subject || !form.body || sendMutation.isPending}>
          {sendMutation.isPending ? "Sending..." : "Send Broadcast"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function MessagingComposer() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <BroadcastMessageComposer />
      <CircularComposer />
    </div>
  );
}
