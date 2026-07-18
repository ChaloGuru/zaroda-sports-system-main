"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPatch, apiDelete } from "@/lib/api-client";

interface ChampionshipDetail {
  id: string;
  name: string;
  category: string;
  county: string;
  location: string;
  startDate: string;
  endDate: string;
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
