import { PanelErrorBoundary } from "@/components/error-boundary";
import { MessagingComposer } from "@/components/admin/messaging-composer";
import { TenantOutreach } from "@/components/admin/tenant-outreach";

export default function AdminMessagingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Messaging &amp; Circulars</h1>
        <p className="text-muted">
          Message tenants in-app and by email, answer their replies, broadcast announcements, or publish a level-targeted circular.
        </p>
      </div>
      <PanelErrorBoundary fallbackTitle="Tenant messaging failed to load">
        <TenantOutreach />
      </PanelErrorBoundary>
      <PanelErrorBoundary fallbackTitle="Messaging composer failed to load">
        <MessagingComposer />
      </PanelErrorBoundary>
    </div>
  );
}
