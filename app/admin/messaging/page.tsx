import { PanelErrorBoundary } from "@/components/error-boundary";
import { MessagingComposer } from "@/components/admin/messaging-composer";

export default function AdminMessagingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Messaging &amp; Circulars</h1>
        <p className="text-muted">Broadcast announcements to all tenants, or publish a level-targeted circular.</p>
      </div>
      <PanelErrorBoundary fallbackTitle="Messaging composer failed to load">
        <MessagingComposer />
      </PanelErrorBoundary>
    </div>
  );
}
