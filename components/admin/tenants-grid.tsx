"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { apiGet, apiPatch, apiDelete } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";

interface TenantRow {
  id: string;
  organizationName: string;
  contactName: string;
  email: string;
  phone: string;
  accountType: string;
  county: string;
  subcounty: string;
  createdAt: string;
  _count: { championships: number };
  subscriptions: Array<{ id: string; status: string; expiresAt: string | null; plan: { displayName: string; level: string } }>;
}

function EditTenantDialog({ tenant }: { tenant: TenantRow }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    organizationName: tenant.organizationName,
    contactName: tenant.contactName,
    phone: tenant.phone,
    county: tenant.county,
    subcounty: tenant.subcounty,
  });

  const editMutation = useMutation({
    mutationFn: () => apiPatch(`/api/tenants/${tenant.id}`, form),
    onSuccess: () => {
      toast.success("Tenant updated");
      queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
      setOpen(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to update tenant"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {tenant.organizationName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="edit-org-name">Organization name</Label>
            <Input
              id="edit-org-name"
              className="mt-1.5"
              value={form.organizationName}
              onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="edit-contact-name">Contact name</Label>
            <Input
              id="edit-contact-name"
              className="mt-1.5"
              value={form.contactName}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="edit-phone">Phone</Label>
            <Input id="edit-phone" className="mt-1.5" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edit-county">County</Label>
              <Input id="edit-county" className="mt-1.5" value={form.county} onChange={(e) => setForm({ ...form, county: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="edit-subcounty">Sub-county</Label>
              <Input
                id="edit-subcounty"
                className="mt-1.5"
                value={form.subcounty}
                onChange={(e) => setForm({ ...form, subcounty: e.target.value })}
              />
            </div>
          </div>
          <Button className="w-full" disabled={editMutation.isPending} onClick={() => editMutation.mutate()}>
            {editMutation.isPending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TenantCard({ tenant }: { tenant: TenantRow }) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = React.useState(false);

  const overrideMutation = useMutation({
    mutationFn: (vars: { subscriptionId: string; status: string }) =>
      apiPatch(`/api/tenants/${tenant.id}`, { subscriptionOverride: vars }),
    onSuccess: () => {
      toast.success("Subscription updated");
      queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Update failed"),
  });

  async function deleteTenant() {
    const confirmed = window.confirm(
      `Delete "${tenant.organizationName}"? This permanently removes every championship, subscription, and payment record they own. This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      await apiDelete(`/api/tenants/${tenant.id}`);
      toast.success("Tenant deleted");
      queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete tenant");
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>{tenant.organizationName}</CardTitle>
          <p className="text-sm text-muted">{tenant.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{tenant.accountType.replace("_", " ")}</Badge>
          <EditTenantDialog tenant={tenant} />
          <Button variant="outline" size="icon" disabled={deleting} onClick={deleteTenant}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted">
          {tenant.county} - {tenant._count.championships} championships - joined {formatDate(tenant.createdAt)}
        </p>
        {tenant.subscriptions.length === 0 && <p className="text-sm text-muted">No subscriptions yet.</p>}
        {tenant.subscriptions.map((sub) => (
          <div key={sub.id} className="flex items-center justify-between rounded-md border border-border p-2">
            <div>
              <p className="text-sm font-medium text-foreground">{sub.plan.displayName}</p>
              <p className="text-xs text-muted">{sub.expiresAt ? `Expires ${formatDate(sub.expiresAt)}` : "No expiry set"}</p>
            </div>
            <Select
              value={sub.status}
              onValueChange={(status) => overrideMutation.mutate({ subscriptionId: sub.id, status })}
            >
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TRIAL">Trial</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function TenantsGrid() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-tenants"],
    queryFn: () => apiGet<{ tenants: TenantRow[] }>("/api/tenants"),
  });

  if (isLoading) return <p className="text-muted">Loading tenants...</p>;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {(data?.tenants ?? []).map((tenant) => (
        <TenantCard key={tenant.id} tenant={tenant} />
      ))}
      {(data?.tenants ?? []).length === 0 && <p className="text-muted">No tenants registered yet.</p>}
    </div>
  );
}
