import { PanelErrorBoundary } from "@/components/error-boundary";
import { RoleManager } from "@/components/admin/role-manager";

export default function AdminRolesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Roles &amp; Officials</h1>
        <p className="text-muted">Create level admins, scorekeepers, and officials scoped to a championship.</p>
      </div>
      <PanelErrorBoundary fallbackTitle="Role management failed to load">
        <RoleManager />
      </PanelErrorBoundary>
    </div>
  );
}
