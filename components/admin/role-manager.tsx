"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPost } from "@/lib/api-client";

interface ChampionshipOption {
  id: string;
  name: string;
  level: string;
  tenant: { organizationName: string };
}

interface RoleRow {
  id: string;
  role: string;
  user: { id: string; name: string; email: string };
}

const ASSIGNABLE_ROLES = [
  { value: "TOURNAMENT_ADMIN", label: "Tournament Admin" },
  { value: "SCOREKEEPER", label: "Scorekeeper" },
  { value: "OFFICIAL", label: "Official" },
];

export function RoleManager() {
  const queryClient = useQueryClient();
  const [championshipId, setChampionshipId] = React.useState<string>("");
  const [form, setForm] = React.useState({ email: "", name: "", password: "", role: "TOURNAMENT_ADMIN" });

  const { data: championshipsData } = useQuery({
    queryKey: ["admin-championships-picker"],
    queryFn: () => apiGet<{ championships: ChampionshipOption[] }>("/api/championships"),
  });

  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ["championship-roles", championshipId],
    queryFn: () => apiGet<{ roles: RoleRow[] }>(`/api/admin/roles?championshipId=${championshipId}`),
    enabled: !!championshipId,
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      apiPost("/api/admin/roles", {
        championshipId,
        role: form.role,
        email: form.email,
        name: form.name || undefined,
        password: form.password || undefined,
      }),
    onSuccess: () => {
      toast.success("Role assigned");
      setForm({ email: "", name: "", password: "", role: "TOURNAMENT_ADMIN" });
      queryClient.invalidateQueries({ queryKey: ["championship-roles", championshipId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to assign role"),
  });

  const championships = championshipsData?.championships ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Assign a championship-level role</CardTitle>
          <CardDescription>
            Create level admins, scorekeepers, or officials scoped to a single championship.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Championship</Label>
            <Select value={championshipId} onValueChange={setChampionshipId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a championship" />
              </SelectTrigger>
              <SelectContent>
                {championships.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.tenant.organizationName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="official@example.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Name (new accounts only)</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Password (new accounts only)</Label>
              <Input
                type="password"
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(role) => setForm({ ...form, role })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSIGNABLE_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={() => assignMutation.mutate()}
            disabled={!championshipId || !form.email || assignMutation.isPending}
          >
            {assignMutation.isPending ? "Assigning..." : "Assign Role"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current assignments</CardTitle>
          <CardDescription>Roles scoped to the selected championship.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!championshipId && <p className="text-sm text-muted">Select a championship to view its team.</p>}
          {championshipId && rolesLoading && <p className="text-sm text-muted">Loading...</p>}
          {championshipId &&
            (rolesData?.roles ?? []).map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{r.user.name}</p>
                  <p className="text-xs text-muted">{r.user.email}</p>
                </div>
                <Badge variant="secondary">{r.role.replace("_", " ")}</Badge>
              </div>
            ))}
          {championshipId && (rolesData?.roles ?? []).length === 0 && !rolesLoading && (
            <p className="text-sm text-muted">No officials assigned yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
