import { PanelErrorBoundary } from "@/components/error-boundary";
import { PayoutAccountPanel } from "@/components/dashboard/payout-account-panel";

export default function DashboardPayoutAccountPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Payout Account</h1>
        <p className="text-muted">Configure the bank account that receives your team registration fees.</p>
      </div>
      <PanelErrorBoundary fallbackTitle="Payout account failed to load">
        <PayoutAccountPanel />
      </PanelErrorBoundary>
    </div>
  );
}
