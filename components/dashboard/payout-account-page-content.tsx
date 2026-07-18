"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PayoutAccountPanel } from "@/components/dashboard/payout-account-panel";
import { apiGet } from "@/lib/api-client";

interface TenantOption {
  id: string;
  organizationName: string;
}

/**
 * A super admin has no tenant of their own, so /dashboard/payout-account
 * (normally just "your" payout account) needs a tenant picker before it can
 * show anything - without one, the page has no way to know whose account to
 * configure and every request fails with "No tenant is associated with this
 * account".
 */
export function PayoutAccountPageContent({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [tenantId, setTenantId] = React.useState("");

  const { data: tenantsData, isLoading } = useQuery({
    queryKey: ["admin-tenants-lite"],
    queryFn: () => apiGet<{ tenants: TenantOption[] }>("/api/tenants"),
    enabled: isSuperAdmin,
  });

  if (!isSuperAdmin) {
    return <PayoutAccountPanel />;
  }

  const tenants = tenantsData?.tenants ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Label>Tenant</Label>
        <Select value={tenantId} onValueChange={setTenantId}>
          <SelectTrigger className="mt-1.5 w-80">
            <SelectValue placeholder={isLoading ? "Loading tenants..." : "Select a tenant to configure"} />
          </SelectTrigger>
          <SelectContent>
            {tenants.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.organizationName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1.5 text-xs text-muted">
          As a super admin you have no tenant of your own - pick which tenant&apos;s payout account you&apos;re configuring.
        </p>
      </div>
      {tenantId && <PayoutAccountPanel tenantId={tenantId} />}
    </div>
  );
}
