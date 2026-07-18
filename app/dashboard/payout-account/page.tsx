import { redirect } from "next/navigation";
import { PanelErrorBoundary } from "@/components/error-boundary";
import { PayoutAccountPageContent } from "@/components/dashboard/payout-account-page-content";
import { getAuthContext, isSuperAdmin } from "@/lib/authorize";

export default async function DashboardPayoutAccountPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Payout Account</h1>
        <p className="text-muted">Configure the bank account that receives your team registration fees.</p>
      </div>
      <PanelErrorBoundary fallbackTitle="Payout account failed to load">
        <PayoutAccountPageContent isSuperAdmin={isSuperAdmin(ctx)} />
      </PanelErrorBoundary>
    </div>
  );
}
