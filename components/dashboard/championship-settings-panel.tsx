"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPatch, apiDelete } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";

interface ChampionshipDetail {
  id: string;
  name: string;
  category: string;
  county: string;
  location: string;
  startDate: string;
  endDate: string;
  registrationClosesAt: string | null;
  ageCutoffDate: string | null;
  tenant: { id: string; organizationName: string };
}

interface TenantOption {
  id: string;
  organizationName: string;
}

const CATEGORIES = ["BALL_GAMES", "ATHLETICS", "MUSIC", "OTHER_GAMES"];

function toDateInput(value: string): string {
  return value.slice(0, 10);
}

/** "2026-10-06T21:00:00.000Z" as the local value a datetime-local input shows. */
function toDateTimeInput(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

/**
 * When learner registration closes (after it only tournament admins can add
 * or change learners) and the date ages are worked out on for events with a
 * maximum age.
 */
function RegistrationRulesCard({ championship }: { championship: ChampionshipDetail }) {
  const queryClient = useQueryClient();
  const [closesAt, setClosesAt] = React.useState(toDateTimeInput(championship.registrationClosesAt));
  const [ageDate, setAgeDate] = React.useState(championship.ageCutoffDate ? toDateInput(championship.ageCutoffDate) : "");

  const save = useMutation({
    mutationFn: () =>
      apiPatch(`/api/championships/${championship.id}`, {
        registrationClosesAt: closesAt ? new Date(closesAt).toISOString() : null,
        ageCutoffDate: ageDate || null,
      }),
    onSuccess: () => {
      toast.success("Registration rules saved");
      queryClient.invalidateQueries({ queryKey: ["championship", championship.id] });
      queryClient.invalidateQueries({ queryKey: ["learners", championship.id] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to save"),
  });
  const closed = championship.registrationClosesAt && new Date(championship.registrationClosesAt) <= new Date();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registration &amp; age rules</CardTitle>
        <CardDescription>
          After registration closes, only tournament admins can add learners, enter them in events or change their
          details and photos - so who competes can&apos;t be swapped late. Every change is in the audit log.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {closed && <p className="text-sm font-medium text-[#B45309]">Registration is closed.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="settings-closes">Registration closes</Label>
            <Input id="settings-closes" type="datetime-local" className="mt-1.5" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
            <p className="mt-1 text-xs text-muted">Leave empty to keep registration open.</p>
          </div>
          <div>
            <Label htmlFor="settings-age-date">Ages worked out on</Label>
            <Input id="settings-age-date" type="date" className="mt-1.5" value={ageDate} onChange={(e) => setAgeDate(e.target.value)} />
            <p className="mt-1 text-xs text-muted">
              For events with a maximum age (set per event in Games). Empty means the start date,{" "}
              {formatDate(championship.startDate)}.
            </p>
          </div>
        </div>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving..." : "Save rules"}
        </Button>
      </CardContent>
    </Card>
  );
}

function TransferTenantCard({ championshipId, currentTenant }: { championshipId: string; currentTenant: { id: string; organizationName: string } }) {
  const router = useRouter();
  const [tenantId, setTenantId] = React.useState("");

  const { data: tenants } = useQuery({
    queryKey: ["admin-tenants-lite"],
    queryFn: () => apiGet<{ tenants: TenantOption[] }>("/api/tenants"),
  });

  const transferMutation = useMutation({
    mutationFn: () => apiPatch(`/api/championships/${championshipId}`, { tenantId }),
    onSuccess: () => {
      toast.success("Championship transferred");
      router.refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to transfer championship"),
  });

  const options = (tenants?.tenants ?? []).filter((t) => t.id !== currentTenant.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transfer to a tenant</CardTitle>
        <CardDescription>
          Currently owned by <strong>{currentTenant.organizationName}</strong>. Use this if this championship was created
          ahead of time and the actual tenant has since subscribed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={tenantId} onValueChange={setTenantId}>
          <SelectTrigger><SelectValue placeholder="Select destination tenant" /></SelectTrigger>
          <SelectContent>
            {options.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.organizationName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button disabled={!tenantId || transferMutation.isPending} onClick={() => transferMutation.mutate()}>
          {transferMutation.isPending ? "Transferring..." : "Transfer championship"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function ChampionshipSettingsPanel({ championshipId, isSuperAdmin }: { championshipId: string; isSuperAdmin?: boolean }) {
  const router = useRouter();
  const [deleting, setDeleting] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["championship", championshipId],
    queryFn: () => apiGet<{ championship: ChampionshipDetail }>(`/api/championships/${championshipId}`),
  });

  const [form, setForm] = React.useState<{
    name: string;
    category: string;
    county: string;
    location: string;
    startDate: string;
    endDate: string;
  } | null>(null);

  React.useEffect(() => {
    if (data?.championship && !form) {
      const c = data.championship;
      setForm({
        name: c.name,
        category: c.category,
        county: c.county,
        location: c.location,
        startDate: toDateInput(c.startDate),
        endDate: toDateInput(c.endDate),
      });
    }
  }, [data, form]);

  const saveMutation = useMutation({
    mutationFn: () => apiPatch(`/api/championships/${championshipId}`, form),
    onSuccess: () => {
      toast.success("Championship updated");
      router.refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to save changes"),
  });

  async function deleteChampionship() {
    if (!data?.championship) return;
    const confirmed = window.confirm(
      `Delete "${data.championship.name}"? This permanently removes every game, participant, team, fixture, and result in it. This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      await apiDelete(`/api/championships/${championshipId}`);
      toast.success("Championship deleted");
      router.push("/dashboard/championships");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete championship");
      setDeleting(false);
    }
  }

  if (isLoading || !form) return <p className="text-muted">Loading settings...</p>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Championship details</CardTitle>
          <CardDescription>Basic details can be corrected here. Level and school level are fixed after creation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="settings-name">Name</Label>
            <Input id="settings-name" className="mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs text-muted">
              Controls which dashboard tab shows for this championship - Participants (Athletics/Music) or Teams (Ball
              Games/Other Games). Changing it doesn&apos;t touch existing games, which each keep their own category.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="settings-county">County</Label>
              <Input id="settings-county" className="mt-1.5" value={form.county} onChange={(e) => setForm({ ...form, county: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="settings-location">Location</Label>
              <Input id="settings-location" className="mt-1.5" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="settings-start">Start date</Label>
              <Input
                id="settings-start"
                type="date"
                className="mt-1.5"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="settings-end">End date</Label>
              <Input
                id="settings-end"
                type="date"
                className="mt-1.5"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
          </div>
          <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? "Saving..." : "Save changes"}
          </Button>
        </CardContent>
      </Card>

      {data?.championship && <RegistrationRulesCard championship={data.championship} />}

      {isSuperAdmin && data?.championship.tenant && (
        <TransferTenantCard championshipId={championshipId} currentTenant={data.championship.tenant} />
      )}

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <CardDescription>Deleting a championship permanently removes all of its games, participants, teams, and fixtures.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" disabled={deleting} onClick={deleteChampionship}>
            <Trash2 className="h-4 w-4" /> {deleting ? "Deleting..." : "Delete championship"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
