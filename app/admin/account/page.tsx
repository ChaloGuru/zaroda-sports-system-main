import { ChangePasswordForm } from "@/components/account/change-password-form";

export default function AdminAccountPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Account</h1>
        <p className="text-muted">Manage your login details.</p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
