"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Link2 } from "lucide-react";
import type { KsefDivision, KsefRegistrationStatus } from "@prisma/client";
import { KSEF_DIVISION_LABELS } from "@/lib/ksef-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPost } from "@/lib/api-client";
import type { KsefEditionSummary } from "./types";

interface LinkState {
  url: string | null;
  closesAt: string | null;
  isOpen: boolean;
}

interface Registration {
  id: string;
  schoolName: string;
  county: string;
  subcounty: string;
  zone: string | null;
  divisions: KsefDivision[];
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  status: KsefRegistrationStatus;
  rejectionReason: string | null;
  createdAt: string;
  reviewedBy: { name: string } | null;
  _count: { projects: number };
  matches: { id: string; name: string; subcounty: string; county: string }[];
}

const STATUS_BADGE = {
  PENDING: { variant: "warning", label: "Pending" },
  APPROVED: { variant: "success", label: "Approved" },
  REJECTED: { variant: "destructive", label: "Rejected" },
} as const;

/** datetime-local input value (local time) for an ISO date. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** The edition's open school registration link, and the schools that signed up through it. */
export function SchoolRegistrations({ edition }: { edition: KsefEditionSummary }) {
  const queryClient = useQueryClient();
  const readOnly = edition.status === "CLOSED";

  const { data: link } = useQuery({
    queryKey: ["ksef-registration-link", edition.id],
    queryFn: () => apiGet<LinkState>(`/api/ksef/registration-link?editionId=${edition.id}`),
  });
  const { data } = useQuery({
    queryKey: ["ksef-registrations", edition.id],
    queryFn: () => apiGet<{ registrations: Registration[] }>(`/api/ksef/registrations?editionId=${edition.id}`),
  });
  const registrations = data?.registrations ?? [];
  const pendingCount = registrations.filter((r) => r.status === "PENDING").length;

  const [deadline, setDeadline] = React.useState("");
  React.useEffect(() => setDeadline(toLocalInput(link?.closesAt ?? null)), [link?.closesAt]);

  const linkMutation = useMutation({
    mutationFn: (action: "OPEN" | "ROTATE" | "CLOSE" | "DEADLINE") =>
      apiPost<LinkState>("/api/ksef/registration-link", {
        editionId: edition.id,
        action,
        closesAt: deadline ? new Date(deadline).toISOString() : null,
      }),
    onSuccess: (_result, action) => {
      toast.success(
        { OPEN: "Registration is open", ROTATE: "New link created - the old one no longer works", CLOSE: "Registration closed", DEADLINE: "Deadline saved" }[action],
      );
      queryClient.invalidateQueries({ queryKey: ["ksef-registration-link", edition.id] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to update the registration link"),
  });

  const [choices, setChoices] = React.useState<Record<string, string>>({});
  const decideMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => apiPost(`/api/ksef/registrations/${id}`, body),
    onSuccess: (_result, { body }) => {
      toast.success(body.action === "APPROVE" ? "School approved" : "Registration rejected");
      queryClient.invalidateQueries({ queryKey: ["ksef-registrations", edition.id] });
      queryClient.invalidateQueries({ queryKey: ["ksef-schools", edition.id] });
      queryClient.invalidateQueries({ queryKey: ["ksef-projects", edition.id] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to save the decision"),
  });

  function reject(r: Registration) {
    const reason = window.prompt(`Why is ${r.schoolName}'s registration being rejected? This is emailed to ${r.contactEmail}.`);
    if (reason?.trim()) decideMutation.mutate({ id: r.id, body: { action: "REJECT", reason: reason.trim() } });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" /> School self-registration
          {pendingCount > 0 && <Badge variant="warning">{pendingCount} to review</Badge>}
        </CardTitle>
        <CardDescription>
          Share one link with schools. Each school gets its own private link by email to enter its projects. Approve schools here, then
          submit their projects on the Projects page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3 rounded-md border border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={link?.isOpen ? "success" : "secondary"}>{link?.isOpen ? "Open" : link?.url ? "Closed (deadline passed)" : "Not open"}</Badge>
            {link?.url && (
              <>
                <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-xs">{link.url}</code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(link.url!);
                    toast.success("Registration link copied");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="registration-deadline">Registration closes</Label>
              <Input id="registration-deadline" type="datetime-local" className="mt-1.5 w-60" value={deadline} onChange={(e) => setDeadline(e.target.value)} disabled={readOnly} />
            </div>
            {link?.url && (
              <Button variant="outline" disabled={readOnly || linkMutation.isPending} onClick={() => linkMutation.mutate("DEADLINE")}>
                Save deadline
              </Button>
            )}
            {!link?.url ? (
              <Button disabled={readOnly || linkMutation.isPending} onClick={() => linkMutation.mutate("OPEN")}>
                Open registration
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  disabled={readOnly || linkMutation.isPending}
                  onClick={() => window.confirm("Create a new link? The current one will stop working for schools that haven't used it yet.") && linkMutation.mutate("ROTATE")}
                >
                  New link
                </Button>
                <Button
                  variant="outline"
                  disabled={readOnly || linkMutation.isPending}
                  onClick={() => window.confirm("Close registration? Schools already registered keep their private links but can't change entries after the deadline.") && linkMutation.mutate("CLOSE")}
                >
                  Close registration
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {registrations.length === 0 && <p className="text-sm text-muted">No schools have registered through the link yet.</p>}
          {registrations.map((r) => {
            const badge = STATUS_BADGE[r.status];
            const choice = choices[r.id] ?? "NEW";
            return (
              <div key={r.id} className="space-y-2 rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{r.schoolName}</span>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  <span className="text-sm text-muted">
                    {r.divisions.map((d) => KSEF_DIVISION_LABELS[d]).join(" & ") || "Level not given"} · {r.subcounty}, {r.county} · {r._count.projects} project{r._count.projects === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="text-sm text-muted">
                  {r.contactName} · {r.contactEmail}
                  {r.contactPhone ? ` · ${r.contactPhone}` : ""} · registered {new Date(r.createdAt).toLocaleDateString("en-KE")}
                  {r.reviewedBy ? ` · decided by ${r.reviewedBy.name}` : ""}
                </p>
                {r.status === "REJECTED" && r.rejectionReason && <p className="text-sm text-foreground">Reason: {r.rejectionReason}</p>}
                {r.status === "PENDING" && !readOnly && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Select value={choice} onValueChange={(v) => setChoices((c) => ({ ...c, [r.id]: v }))}>
                      <SelectTrigger className="w-full sm:w-80">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NEW">Accept as a new school</SelectItem>
                        {r.matches.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            Same as existing: {m.name} ({m.subcounty})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      disabled={decideMutation.isPending}
                      onClick={() => decideMutation.mutate({ id: r.id, body: { action: "APPROVE", ...(choice !== "NEW" ? { schoolId: choice } : {}) } })}
                    >
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" disabled={decideMutation.isPending} onClick={() => reject(r)}>
                      Reject
                    </Button>
                    {r.matches.length > 0 && choice === "NEW" && (
                      <span className="text-xs text-muted">Similar schools already exist - check before accepting as new.</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
