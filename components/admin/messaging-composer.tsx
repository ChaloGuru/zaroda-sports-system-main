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
import { FileText, X } from "lucide-react";
import { ApiError, apiGet, apiPost } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";

const LEVELS = ["BASE", "ZONE", "SUB_COUNTY", "COUNTY", "REGIONAL", "NATIONAL"];

interface CircularRow {
  id: string;
  title: string;
  content: string;
  targetLevel: string;
  createdAt: string;
}

function CircularComposer() {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState({
    title: "",
    content: "",
    senderName: "National Admin",
    targetLevel: "NATIONAL",
  });
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

  const sendMutation = useMutation({
    mutationFn: () =>
      apiPost("/api/circulars", {
        title: form.title,
        content: form.content,
        senderName: form.senderName,
        senderRole: "National Admin",
        targetLevel: form.targetLevel,
        isPublished: true,
        documentUrl: documentUrl ?? undefined,
      }),
    onSuccess: () => {
      toast.success("Circular published");
      setForm({ title: "", content: "", senderName: "National Admin", targetLevel: "NATIONAL" });
      removeAttachment();
      queryClient.invalidateQueries({ queryKey: ["admin-circulars"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to publish circular"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Circulars</CardTitle>
        <CardDescription>Broadcast to all tenants, or target a specific competition level.</CardDescription>
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
                    {level === "NATIONAL" ? "All Tenants (National)" : level.replace("_", " ")}
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
        <Button
          onClick={() => sendMutation.mutate()}
          disabled={!form.title || !form.content || uploading || sendMutation.isPending}
        >
          {sendMutation.isPending ? "Publishing..." : "Publish Circular"}
        </Button>

        <div className="space-y-2 pt-2">
          <p className="text-sm font-medium text-foreground">Recently published</p>
          {(data?.circulars ?? []).slice(0, 5).map((c) => (
            <div key={c.id} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">{c.title}</p>
                <Badge variant="outline">{c.targetLevel.replace("_", " ")}</Badge>
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
