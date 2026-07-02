"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { apiGet, apiPost } from "@/lib/api-client";
import { formatKes, formatDate } from "@/lib/utils";

interface Plan {
  id: string;
  displayName: string;
  level: string;
  priceKes: number;
}

interface Subscription {
  id: string;
  status: string;
  expiresAt: string | null;
  plan: { displayName: string; level: string };
}

interface TenantMe {
  tenant: {
    subscriptions: Subscription[];
  };
}

export default function BillingPage() {
  const { data: plans } = useQuery({ queryKey: ["plans"], queryFn: () => apiGet<{ plans: Plan[] }>("/api/plans") });
  const { data: tenantMe, refetch } = useQuery({
    queryKey: ["tenant-me"],
    queryFn: () => apiGet<TenantMe>("/api/tenants/me"),
  });

  async function subscribe(planId: string) {
    try {
      const result = await apiPost<{ authorizationUrl: string }>("/api/payments/initialize", {
        mode: "subscription",
        planId,
      });
      window.location.href = result.authorizationUrl;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start checkout");
    }
  }

  React.useEffect(() => {
    refetch();
  }, [refetch]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Billing</h1>
        <p className="text-muted">Manage your Essential subscriptions. Base level is always free.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> Active subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tenantMe?.tenant.subscriptions ?? []).map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.plan.displayName}</TableCell>
                  <TableCell><Badge variant={s.status === "ACTIVE" ? "success" : "outline"}>{s.status}</Badge></TableCell>
                  <TableCell>{s.expiresAt ? formatDate(s.expiresAt) : "-"}</TableCell>
                </TableRow>
              ))}
              {(tenantMe?.tenant.subscriptions ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted">No active subscriptions yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Essential plans</CardTitle>
          <CardDescription>Subscribe to unlock a specific level for your championships.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(plans?.plans ?? []).map((plan) => (
            <div key={plan.id} className="flex flex-col justify-between rounded-md border border-border p-4">
              <div>
                <p className="font-medium text-foreground">{plan.displayName}</p>
                <p className="font-mono text-2xl font-bold tabular-nums text-primary">{formatKes(plan.priceKes)}</p>
              </div>
              <Button className="mt-4" size="sm" onClick={() => subscribe(plan.id)}>
                Subscribe
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
