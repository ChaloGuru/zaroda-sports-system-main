"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import { toast } from "sonner";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { ApiError, apiPost } from "@/lib/api-client";

interface InviteInfo {
  editionName: string;
  email: string;
  name: string | null;
  phone: string | null;
  roleLabel: string;
  expiresAt: string;
  accountExists: boolean;
  signedInAsInvitee: boolean;
  signedInAsSomeoneElse: boolean;
}

/** KSEF panel self-onboarding: the page a judge's signup link opens. */
export default function KsefJoinPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = React.useState<InviteInfo | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({ name: "", phone: "", password: "", confirm: "" });
  const [busy, setBusy] = React.useState(false);
  const here = `/ksef/join/${token}`;

  React.useEffect(() => {
    fetch(`/api/ksef/join?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new ApiError(json.error ?? "This link isn't valid", response.status);
        setInfo(json);
        setForm((f) => ({ ...f, name: json.name ?? "", phone: json.phone ?? "" }));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "This link isn't valid"));
  }, [token]);

  async function acceptAsExistingUser() {
    setBusy(true);
    try {
      await apiPost("/api/ksef/join", { token });
      toast.success(`Welcome to the ${info?.editionName} panel`);
      router.push("/dashboard/ksef-judging");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't accept the invitation");
    } finally {
      setBusy(false);
    }
  }

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    if (!info) return;
    if (form.password !== form.confirm) {
      toast.error("The passwords don't match");
      return;
    }
    setBusy(true);
    try {
      await apiPost("/api/ksef/join", { token, name: form.name, phone: form.phone, password: form.password });
      const result = await signIn("credentials", { email: info.email, password: form.password, redirect: false });
      toast.success(`Welcome to the ${info.editionName} panel`);
      router.push(result?.error ? "/login" : "/dashboard/ksef-judging");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create your account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <FlaskConical className="h-10 w-10 text-primary" />
          <CardTitle>{info ? `Join the ${info.editionName} panel` : "KSEF panel invitation"}</CardTitle>
          {info && (
            <CardDescription>
              You&apos;ve been invited as a <span className="font-semibold text-foreground">{info.roleLabel}</span> for{" "}
              <span className="font-semibold text-foreground">{info.email}</span>.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {!info && !error && <p className="text-center text-muted">Checking your invitation...</p>}

          {error && (
            <div className="space-y-4 text-center">
              <p className="text-foreground">{error}</p>
              <Button asChild variant="outline">
                <Link href="/login">Go to sign in</Link>
              </Button>
            </div>
          )}

          {info?.accountExists && info.signedInAsInvitee && (
            <Button className="w-full" size="lg" disabled={busy} onClick={acceptAsExistingUser}>
              {busy ? "Joining..." : "Accept invitation"}
            </Button>
          )}

          {info?.accountExists && !info.signedInAsInvitee && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted">
                {info.email} already has a Zaroda account. Sign in with it to accept this invitation.
              </p>
              {info.signedInAsSomeoneElse ? (
                <Button className="w-full" onClick={() => signOut({ callbackUrl: `/login?callbackUrl=${encodeURIComponent(here)}` })}>
                  Sign out and sign in as {info.email}
                </Button>
              ) : (
                <Button asChild className="w-full">
                  <Link href={`/login?callbackUrl=${encodeURIComponent(here)}`}>Sign in to accept</Link>
                </Button>
              )}
            </div>
          )}

          {info && !info.accountExists && (
            <form onSubmit={createAccount} className="space-y-4">
              <p className="text-sm text-muted">Set up your account. You&apos;ll sign in with {info.email} and the password you choose here.</p>
              <div>
                <Label htmlFor="name">Full name</Label>
                <Input id="name" className="mt-1.5" autoComplete="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input id="phone" className="mt-1.5" autoComplete="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="password">Choose a password</Label>
                <PasswordInput id="password" className="mt-1.5" autoComplete="new-password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
                <p className="mt-1 text-xs text-muted">At least 8 characters, with an uppercase letter and a number.</p>
              </div>
              <div>
                <Label htmlFor="confirm">Confirm password</Label>
                <PasswordInput id="confirm" className="mt-1.5" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={busy || !form.name.trim() || !form.password}>
                {busy ? "Setting up..." : "Create account and join"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
