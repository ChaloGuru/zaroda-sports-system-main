"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { ApiError, apiPost } from "@/lib/api-client";

/** Where an official added through Roles chooses their password (see lib/account-setup.ts). */
export default function AccountSetupPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = React.useState<{ email: string; name: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({ password: "", confirm: "" });
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    fetch(`/api/account/setup?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new ApiError(json.error ?? "This link isn't valid", response.status);
        setInfo(json);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "This link isn't valid"));
  }, [token]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!info) return;
    if (form.password !== form.confirm) {
      toast.error("The passwords don't match");
      return;
    }
    setBusy(true);
    try {
      await apiPost("/api/account/setup", { token, password: form.password, confirmPassword: form.confirm });
      const result = await signIn("credentials", { email: info.email, password: form.password, redirect: false });
      toast.success("Your account is ready");
      router.push(result?.error ? "/login" : "/dashboard");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't set up your account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <KeyRound className="h-10 w-10 text-primary" />
          <CardTitle>Set up your account</CardTitle>
          {info && (
            <CardDescription>
              Welcome, {info.name}. You&apos;ll sign in with <span className="font-semibold text-foreground">{info.email}</span> and the
              password you choose here.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {!info && !error && <p className="text-center text-muted">Checking your link...</p>}

          {error && (
            <div className="space-y-4 text-center">
              <p className="text-foreground">{error}</p>
              <Button asChild variant="outline">
                <Link href="/login">Go to sign in</Link>
              </Button>
            </div>
          )}

          {info && (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="password">Choose a password</Label>
                <PasswordInput id="password" className="mt-1.5" autoComplete="new-password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
                <p className="mt-1 text-xs text-muted">At least 8 characters, with an uppercase letter and a number.</p>
              </div>
              <div>
                <Label htmlFor="confirm">Confirm password</Label>
                <PasswordInput id="confirm" className="mt-1.5" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={busy || !form.password}>
                {busy ? "Setting up..." : "Set password and sign in"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
