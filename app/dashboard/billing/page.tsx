"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import Link from "next/link";
import { apiGet } from "@/lib/api-client";
import { MpesaSubscribeDialog } from "@/components/dashboard/mpesa-subscribe-dialog";
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
  paidAt: string | null;
  plan: { displayName: string; level: string };
  championship: { id: string; name: string } | null;
}

interface TenantMe {
  tenant: {
    phone: string;
    subscriptions: Subscription[];
  };
}

export default function BillingPage() {
  const { data: plans } = useQuery({ queryKey: ["plans"], queryFn: () => apiGet<{ plans: Plan[] }>("/api/plans") });
  const { data: tenantMe, refetch } = useQuery({
    queryKey: ["tenant-me"],
    queryFn: () => apiGet<TenantMe>("/api/tenants/me"),
  });

  const [paying, setPaying] = React.useState<Plan | null>(null);

  React.useEffect(() => {
    refetch();
  }, [refetch]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Billing</h1>
        <p className="text-muted">
          Each subscription pays for one championship at its level. Inter School level championships are always free.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> Your subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Championship</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tenantMe?.tenant.subscriptions ?? []).map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.plan.displayName}</TableCell>
                  <TableCell>{s.paidAt ? formatDate(s.paidAt) : "-"}</TableCell>
                  <TableCell>
                    {s.championship ? (
                      <Link href={`/dashboard/championships/${s.championship.id}`} className="text-primary hover:underline">
                        {s.championship.name}
                      </Link>
                    ) : (
                      <Badge variant="success">Ready - create a championship at this level</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(tenantMe?.tenant.subscriptions ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted">No subscriptions yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Essential plans</CardTitle>
          <CardDescription>Pay once for each championship you run at Zone level and above.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(plans?.plans ?? []).map((plan) => (
            <div key={plan.id} className="flex flex-col justify-between rounded-md border border-border p-4">
              <div>
                <p className="font-medium text-foreground">{plan.displayName}</p>
                <p className="font-mono text-2xl font-bold tabular-nums text-primary">{formatKes(plan.priceKes)}</p>
              </div>
              <Button className="mt-4" size="sm" onClick={() => setPaying(plan)}>
                Subscribe with M-Pesa
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {paying && (
        <MpesaSubscribeDialog
          plan={paying}
          defaultPhone={tenantMe?.tenant.phone}
          onClose={() => setPaying(null)}
          onPaid={() => void refetch()}
        />
      )}
    </div>
  );
}
