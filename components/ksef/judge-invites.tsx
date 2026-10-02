"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Mail, MessageCircle, MessageSquare, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPost } from "@/lib/api-client";
import { KSEF_PANEL_ROLE_LABELS } from "@/lib/ksef-config";
import { formatDate } from "@/lib/utils";
import type { KsefEditionSummary } from "./types";

const PANEL_ROLES = ["JUDGE", "CHIEF_JUDGE", "SRC_MEMBER"] as const;
type PanelRole = (typeof PANEL_ROLES)[number];

interface InviteRow {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: PanelRole;
  expiresAt: string;
  createdAt: string;
  state: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  acceptedBy: { name: string } | null;
}

interface SendTarget {
  url: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: PanelRole;
  /** Whether the server emailed the link, and why not if it didn't. */
  emailed: boolean;
  emailError: string | null;
}

const STATE_BADGE = { PENDING: "warning", ACCEPTED: "success", REVOKED: "secondary", EXPIRED: "secondary" } as const;

/** Kenyan numbers to the international form wa.me expects (0712... -> 254712...). */
function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
}

function inviteMessage(target: SendTarget, editionName: string): string {
  return (
    `Hello${target.name ? ` ${target.name}` : ""}, you've been invited to join the ${editionName} panel on Zaroda Sports as a ` +
    `${KSEF_PANEL_ROLE_LABELS[target.role]}.\n\nOpen this link to set up your account (it's for ${target.email} only, works once and ` +
    `expires in 14 days):\n${target.url}`
  );
}

/** The freshly issued link and one-tap ways to send it - shown once, since only its hash is stored. */
function SendInviteDialog({ target, editionName, onClose }: { target: SendTarget; editionName: string; onClose: () => void }) {
  const message = inviteMessage(target, editionName);
  const encoded = encodeURIComponent(message);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error("Couldn't copy - select and copy it manually");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invitation created</DialogTitle>
          <DialogDescription>
            Send this to {target.name ?? target.email}. For security the link is only shown now - if it&apos;s lost, use
            &quot;New link&quot; on the invitation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {target.emailed ? (
            <p className="rounded-md border border-[#12805C]/40 bg-[#E7F6EF] p-3 text-sm text-[#12805C]">
              ✓ Emailed to {target.email}. You can also send it another way below.
            </p>
          ) : (
            <p className="rounded-md border border-[#B45309]/40 bg-[#FBF2DC] p-3 text-sm text-[#8A6412]">
              Not emailed{target.emailError ? ` (${target.emailError})` : ""} - send the link below.
            </p>
          )}
          <div className="flex gap-2">
            <Input readOnly value={target.url} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
            <Button variant="outline" size="icon" aria-label="Copy link" onClick={() => copy(target.url, "Link")}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {target.phone && (
              <Button asChild variant="secondary">
                <a href={`https://wa.me/${whatsappNumber(target.phone)}?text=${encoded}`} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
              </Button>
            )}
            {target.phone && (
              <Button asChild variant="secondary">
                <a href={`sms:${target.phone.replace(/\s/g, "")}?body=${encoded}`}>
                  <MessageSquare className="h-4 w-4" /> SMS
                </a>
              </Button>
            )}
            <Button asChild variant="secondary">
              <a href={`mailto:${target.email}?subject=${encodeURIComponent(`${editionName} panel invitation`)}&body=${encoded}`}>
                <Mail className="h-4 w-4" /> Email
              </a>
            </Button>
            <Button variant="secondary" onClick={() => copy(message, "Invitation message")}>
              <Copy className="h-4 w-4" /> Copy message
            </Button>
          </div>
          {!target.phone && <p className="text-xs text-muted">Add a phone number to the invitation to send it by WhatsApp or SMS.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Invite people to the edition's panel; they onboard themselves through a signup link. */
export function JudgeInvites({ edition }: { edition: KsefEditionSummary }) {
  const queryClient = useQueryClient();
  const readOnly = edition.status === "CLOSED";
  const [form, setForm] = React.useState({ email: "", name: "", phone: "", specialty: "", role: "JUDGE" as PanelRole });
  const [sending, setSending] = React.useState<SendTarget | null>(null);

  const { data } = useQuery({
    queryKey: ["ksef-invites", edition.id],
    queryFn: () => apiGet<{ invites: InviteRow[] }>(`/api/ksef/invites?editionId=${edition.id}`),
  });
  const invites = (data?.invites ?? []).filter((i) => i.state !== "ACCEPTED");
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["ksef-invites", edition.id] });

  const inviteMutation = useMutation({
    mutationFn: () =>
      apiPost<{ url: string; emailed: boolean; emailError: string | null }>("/api/ksef/invites", { editionId: edition.id, ...form }),
    onSuccess: ({ url, emailed, emailError }) => {
      setSending({
        url,
        email: form.email.trim().toLowerCase(),
        name: form.name.trim() || null,
        phone: form.phone.trim() || null,
        role: form.role,
        emailed,
        emailError,
      });
      setForm({ email: "", name: "", phone: "", specialty: "", role: "JUDGE" });
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to create invitation"),
  });
  const actionMutation = useMutation({
    mutationFn: ({ invite, action }: { invite: InviteRow; action: "REGENERATE" | "REVOKE" }) =>
      apiPost<{ url?: string; emailed?: boolean; emailError?: string | null }>(`/api/ksef/invites/${invite.id}`, { action }),
    onSuccess: (result, { invite, action }) => {
      if (action === "REGENERATE" && result.url) {
        setSending({
          url: result.url,
          email: invite.email,
          name: invite.name,
          phone: invite.phone,
          role: invite.role,
          emailed: !!result.emailed,
          emailError: result.emailError ?? null,
        });
      } else {
        toast.success("Invitation cancelled");
      }
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Action failed"),
  });

  return (
    <>
      {!readOnly && (
        <Card>
          <CardHeader>
            <CardTitle>Invite to the panel</CardTitle>
            <CardDescription>
              The invitee is emailed a personal signup link, which you can also send by WhatsApp or SMS. The invitee sets their own name and
              password; someone who already has a Zaroda account just signs in to accept. Links work once and expire after 14 days.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Email</Label>
                <Input className="mt-1.5" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <Label>Name (optional)</Label>
                <Input className="mt-1.5" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label>Phone - for WhatsApp/SMS (optional)</Label>
                <Input className="mt-1.5" placeholder="07XX XXX XXX" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <Label>Specialty (optional)</Label>
                <Input className="mt-1.5" placeholder="e.g. Chemistry" value={form.specialty} onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))} />
              </div>
              <div>
                <Label>Panel role</Label>
                <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as PanelRole }))}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PANEL_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {KSEF_PANEL_ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted">
              Chief Judges review flagged judging discrepancies; SRC members decide written complaints. Neither can act on a
              project they are judging themselves.
            </p>
            <Button disabled={!form.email.trim() || inviteMutation.isPending} onClick={() => inviteMutation.mutate()}>
              <Send className="h-4 w-4" /> Create invitation
            </Button>
          </CardContent>
        </Card>
      )}

      {invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Invitations</CardTitle>
            <CardDescription>Accepted invitations move to the panel below.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {invites.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
                <div>
                  <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                    {i.name ?? i.email}
                    <Badge variant={STATE_BADGE[i.state]}>{i.state.toLowerCase()}</Badge>
                    <Badge variant="outline">{KSEF_PANEL_ROLE_LABELS[i.role]}</Badge>
                  </p>
                  <p className="text-sm text-muted">
                    {i.email}
                    {i.phone ? ` · ${i.phone}` : ""} · {i.state === "PENDING" ? `expires ${formatDate(i.expiresAt)}` : `sent ${formatDate(i.createdAt)}`}
                  </p>
                </div>
                {!readOnly && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate({ invite: i, action: "REGENERATE" })}>
                      New link
                    </Button>
                    {i.state === "PENDING" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={actionMutation.isPending}
                        onClick={() => confirm(`Cancel the invitation for ${i.email}? Its link will stop working.`) && actionMutation.mutate({ invite: i, action: "REVOKE" })}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {sending && <SendInviteDialog target={sending} editionName={edition.name} onClose={() => setSending(null)} />}
    </>
  );
}
