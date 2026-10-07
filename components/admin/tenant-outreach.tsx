"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CornerDownRight, Mail, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";

interface TenantOption {
  id: string;
  organizationName: string;
  county: string;
}

interface Batch {
  batchId: string;
  subject: string;
  createdAt: string;
  tenants: number;
  email: { sent: number; failed: number };
  problems: { tenant: string; channel: string; recipient: string; error: string }[];
}

interface Reply {
  id: string;
  subject: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  sender: { id: string; name: string; email: string; tenant: { organizationName: string } | null };
}

interface Overview {
  emailReady: boolean;
  batches: Batch[];
  replies: Reply[];
}

type Audience = "ALL" | "COUNTY" | "TENANTS";

/** The system owner's channel to tenants: in-app always, plus email. */
function Compose({ overview, onSent }: { overview: Overview | undefined; onSent: () => void }) {
  const [audience, setAudience] = React.useState<Audience>("ALL");
  const [county, setCounty] = React.useState("");
  const [picked, setPicked] = React.useState<string[]>([]);
  const [filter, setFilter] = React.useState("");
  const [email, setEmail] = React.useState(true);
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");

  const { data } = useQuery({ queryKey: ["admin-tenants-lite"], queryFn: () => apiGet<{ tenants: TenantOption[] }>("/api/tenants") });
  const tenants = data?.tenants ?? [];
  const counties = Array.from(new Set(tenants.map((t) => t.county).filter(Boolean))).sort();
  const audienceSize =
    audience === "ALL" ? tenants.length : audience === "COUNTY" ? tenants.filter((t) => t.county === county).length : picked.length;

  const send = useMutation({
    mutationFn: () =>
      apiPost<{ tenants: number; email: { sent: number; failed: number } | null }>(
        "/api/admin/outreach",
        {
          audience,
          county: audience === "COUNTY" ? county : undefined,
          tenantIds: audience === "TENANTS" ? picked : undefined,
          email,
          subject,
          body,
        },
      ),
    onSuccess: (r) => {
      const parts = [`${r.tenants} inbox${r.tenants === 1 ? "" : "es"}`];
      if (r.email) parts.push(`${r.email.sent} email${r.email.sent === 1 ? "" : "s"}${r.email.failed ? ` (${r.email.failed} failed)` : ""}`);
      toast.success(`Sent to ${parts.join(", ")}`);
      setSubject("");
      setBody("");
      onSent();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Sending failed"),
  });


  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5 text-primary" /> Message tenants
        </CardTitle>
        <CardDescription>
          Every tenant gets it in their dashboard inbox, where they can reply - and by email if you tick it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Send to</Label>
            <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All tenants ({tenants.length})</SelectItem>
                <SelectItem value="COUNTY">Tenants in a county</SelectItem>
                <SelectItem value="TENANTS">Chosen tenants</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {audience === "COUNTY" && (
            <div>
              <Label>County</Label>
              <Select value={county} onValueChange={setCounty}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Pick a county" /></SelectTrigger>
                <SelectContent>
                  {counties.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {audience === "TENANTS" && (
          <div className="space-y-2">
            <Input placeholder="Search tenants..." value={filter} onChange={(e) => setFilter(e.target.value)} />
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {tenants
                .filter((t) => !filter || `${t.organizationName} ${t.county}`.toLowerCase().includes(filter.toLowerCase()))
                .map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={picked.includes(t.id)}
                      onChange={() => setPicked((p) => (p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id]))}
                    />
                    {t.organizationName} <span className="text-muted">· {t.county}</span>
                  </label>
                ))}
            </div>
          </div>
        )}

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={email} onChange={(e) => setEmail(e.target.checked)} />
          <span>
            <Mail className="mr-1 inline h-4 w-4" /> Also send by email
            {!overview?.emailReady && (
              <span className="block text-xs text-[#B45309]">Email isn&apos;t set up yet - add RESEND_API_KEY and EMAIL_FROM in Vercel.</span>
            )}
          </span>
        </label>

        <div>
          <Label htmlFor="outreach-subject">Subject</Label>
          <Input id="outreach-subject" className="mt-1.5" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
        </div>
        <div>
          <Label htmlFor="outreach-body">Message</Label>
          <Textarea id="outreach-body" className="mt-1.5" rows={6} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} />
        </div>
        <Button
          disabled={send.isPending || !subject.trim() || !body.trim() || audienceSize === 0 || (audience === "COUNTY" && !county)}
          onClick={() => {
            if (window.confirm(`Send "${subject}" to ${audienceSize} tenant${audienceSize === 1 ? "" : "s"}${email ? " (inbox and email)" : " (inbox only)"}?`)) {
              send.mutate();
            }
          }}
        >
          <Send className="h-4 w-4" /> {send.isPending ? "Sending..." : `Send to ${audienceSize} tenant${audienceSize === 1 ? "" : "s"}`}
        </Button>
      </CardContent>
    </Card>
  );
}

function Replies({ replies, onChanged }: { replies: Reply[]; onChanged: () => void }) {
  const [replyingTo, setReplyingTo] = React.useState<string | null>(null);
  const [text, setText] = React.useState("");
  const unread = replies.filter((r) => !r.readAt).map((r) => r.id);

  const markRead = useMutation({ mutationFn: () => apiPatch("/api/admin/outreach", { ids: unread }), onSuccess: onChanged });
  const reply = useMutation({
    mutationFn: (r: Reply) =>
      apiPost("/api/messages", { recipientId: r.sender.id, parentId: r.id, subject: r.subject.startsWith("Re:") ? r.subject : `Re: ${r.subject}`, body: text }),
    onSuccess: () => {
      toast.success("Reply sent to their dashboard inbox");
      setReplyingTo(null);
      setText("");
      onChanged();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Reply failed"),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" /> Replies from tenants
            {unread.length > 0 && <Badge variant="warning">{unread.length} new</Badge>}
          </CardTitle>
          <CardDescription>Tenants reply from their dashboard Messages page.</CardDescription>
        </div>
        {unread.length > 0 && (
          <Button size="sm" variant="outline" disabled={markRead.isPending} onClick={() => markRead.mutate()}>
            Mark all read
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {replies.length === 0 && <p className="text-sm text-muted">No replies yet.</p>}
        {replies.map((r) => (
          <div key={r.id} className={`rounded-md border p-3 text-sm ${r.readAt ? "border-border" : "border-primary/50 bg-primary/5"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-foreground">
                {r.sender.tenant?.organizationName ?? r.sender.name} <span className="font-normal text-muted">· {r.sender.name}</span>
              </p>
              <span className="text-xs text-muted">{formatDate(r.createdAt)}</span>
            </div>
            <p className="mt-1 text-xs text-muted">{r.subject}</p>
            <p className="mt-2 whitespace-pre-wrap text-foreground">{r.body}</p>
            {replyingTo === r.id ? (
              <div className="mt-3 space-y-2">
                <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Your reply" maxLength={5000} />
                <div className="flex gap-2">
                  <Button size="sm" disabled={!text.trim() || reply.isPending} onClick={() => reply.mutate(r)}>
                    {reply.isPending ? "Sending..." : "Send reply"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setReplyingTo(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => { setReplyingTo(r.id); setText(""); }}>
                <CornerDownRight className="h-4 w-4" /> Reply
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SentLog({ batches }: { batches: Batch[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sent messages</CardTitle>
        <CardDescription>What went out, and any email that didn&apos;t arrive.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {batches.length === 0 && <p className="text-sm text-muted">Nothing sent yet.</p>}
        {batches.map((b) => (
          <details key={b.batchId} className="rounded-md border border-border p-3 text-sm">
            <summary className="cursor-pointer list-none">
              <span className="font-medium text-foreground">{b.subject}</span>{" "}
              <span className="text-muted">· {formatDate(b.createdAt)} · {b.tenants} tenant{b.tenants === 1 ? "" : "s"}</span>
              <span className="mt-1 flex flex-wrap gap-2 text-xs">
                {b.email.sent + b.email.failed > 0 && <Badge variant={b.email.failed ? "warning" : "success"}>Email {b.email.sent} sent{b.email.failed ? `, ${b.email.failed} failed` : ""}</Badge>}
              </span>
            </summary>
            {b.problems.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {b.problems.map((p, i) => (
                  <li key={i}>
                    {p.tenant} - email to {p.recipient}: {p.error}
                  </li>
                ))}
              </ul>
            )}
          </details>
        ))}
      </CardContent>
    </Card>
  );
}

export function TenantOutreach() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-outreach"], queryFn: () => apiGet<Overview>("/api/admin/outreach") });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-outreach"] });

  return (
    <div className="space-y-6">
      <Compose overview={data} onSent={refresh} />
      <Replies replies={data?.replies ?? []} onChanged={refresh} />
      <SentLog batches={data?.batches ?? []} />
    </div>
  );
}
