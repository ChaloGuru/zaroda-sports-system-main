import { PanelErrorBoundary } from "@/components/error-boundary";
import { AuditLogViewer } from "@/components/admin/audit-log-viewer";

export default function AdminAuditLogPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Audit Log</h1>
        <p className="text-muted">Every mutating write, captured with actor, before/after data. Super-admin only.</p>
      </div>
      <PanelErrorBoundary fallbackTitle="Audit log failed to load">
        <AuditLogViewer />
      </PanelErrorBoundary>
    </div>
  );
}
