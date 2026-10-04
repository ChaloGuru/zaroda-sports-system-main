"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { FlaskConical, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, apiPost } from "@/lib/api-client";
import { KENYA_COUNTIES, getSubcounties } from "@/lib/kenya-counties";

interface LinkInfo {
  editionName: string;
  closesAt: string | null;
  isOpen: boolean;
}

const EMPTY_FORM = { schoolName: "", county: "", subcounty: "", zone: "", contactName: "", contactEmail: "", contactPhone: "" };

/**
 * KSEF school self-registration (the edition's open link). Collects the
 * school and its contact; the school's private link to enter projects is
 * emailed to that contact, never shown here.
 */
export default function KsefRegisterPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = React.useState<LinkInfo | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [busy, setBusy] = React.useState(false);
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const set = (field: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));

  React.useEffect(() => {
    fetch(`/api/ksef/register?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new ApiError(json.error ?? "This link isn't valid", response.status);
        setInfo(json);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "This link isn't valid"));
  }, [token]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await apiPost<{ email: string }>("/api/ksef/register", { token, ...form });
      setSentTo(result.email);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't register your school");
    } finally {
      setBusy(false);
    }
  }

  const subcounties = getSubcounties(form.county);
  const complete = form.schoolName.trim() && form.county && form.subcounty.trim() && form.contactName.trim() && form.contactEmail.trim();

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-16">
      <Card className="w-full max-w-lg">
        <CardHeader className="items-center text-center">
          <FlaskConical className="h-10 w-10 text-primary" />
          <CardTitle>{info ? `Register for ${info.editionName}` : "KSEF school registration"}</CardTitle>
          {info?.isOpen && (
            <CardDescription>
              Register your school, then enter its projects using the private link we email you.
              {info.closesAt && ` Registration closes ${new Date(info.closesAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}.`}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {!info && !error && <p className="text-center text-muted">Checking your link...</p>}

          {(error || (info && !info.isOpen)) && (
            <div className="space-y-4 text-center">
              <p className="text-foreground">{error ?? `Registration for ${info?.editionName} is closed.`}</p>
              <Button asChild variant="outline">
                <Link href="/">Go to Zaroda Sports</Link>
              </Button>
            </div>
          )}

          {sentTo && (
            <div className="space-y-3 text-center">
              <MailCheck className="mx-auto h-10 w-10 text-primary" />
              <p className="text-foreground">
                Check your email at <span className="font-semibold">{sentTo}</span>.
              </p>
              <p className="text-sm text-muted">
                We&apos;ve sent your school&apos;s private link for entering its projects. It can take a few minutes - check your spam folder too.
                Lost it later? Submit this form again with the same email for a new one.
              </p>
            </div>
          )}

          {info?.isOpen && !sentTo && (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="schoolName">School name</Label>
                <Input id="schoolName" className="mt-1.5" value={form.schoolName} onChange={set("schoolName")} placeholder="e.g. Moi Girls High School" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>County</Label>
                  <Select value={form.county} onValueChange={(county) => setForm((f) => ({ ...f, county, subcounty: "" }))}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Select county" />
                    </SelectTrigger>
                    <SelectContent>
                      {KENYA_COUNTIES.map((c) => (
                        <SelectItem key={c.name} value={c.name}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="subcounty">Sub-county</Label>
                  <Input id="subcounty" className="mt-1.5" list="subcounties" value={form.subcounty} onChange={set("subcounty")} disabled={!form.county} />
                  <datalist id="subcounties">
                    {subcounties.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div>
                <Label htmlFor="zone">Zone (optional)</Label>
                <Input id="zone" className="mt-1.5" value={form.zone} onChange={set("zone")} />
              </div>
              <div className="border-t border-border pt-4">
                <p className="mb-3 text-sm text-muted">Contact person - usually the school&apos;s science fair patron. The private link goes to this email.</p>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="contactName">Full name</Label>
                    <Input id="contactName" className="mt-1.5" autoComplete="name" value={form.contactName} onChange={set("contactName")} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="contactEmail">Email</Label>
                      <Input id="contactEmail" type="email" className="mt-1.5" autoComplete="email" autoCapitalize="none" value={form.contactEmail} onChange={set("contactEmail")} />
                    </div>
                    <div>
                      <Label htmlFor="contactPhone">Phone (optional)</Label>
                      <Input id="contactPhone" type="tel" className="mt-1.5" autoComplete="tel" value={form.contactPhone} onChange={set("contactPhone")} />
                    </div>
                  </div>
                </div>
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={busy || !complete}>
                {busy ? "Registering..." : "Register school"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
