"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { schoolSignupSchema, type SchoolSignupInput } from "@/lib/validations";
import { apiGet, apiPost } from "@/lib/api-client";
import { KENYA_COUNTIES, countyCode, getSubcounties, regionOfCounty } from "@/lib/kenya-counties";
import { sameArea } from "@/lib/jurisdiction";
import type { SignupAreas } from "@/app/api/school-signup/areas/route";

export default function SchoolSignupPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SchoolSignupInput>({
    resolver: zodResolver(schoolSignupSchema),
    defaultValues: { county: "", subcounty: "", baseName: "", zone: "" },
  });

  const county = watch("county");
  const subcounties = getSubcounties(county);
  const subcounty = watch("subcounty");
  const zone = watch("zone");
  const { data: areas } = useQuery({
    queryKey: ["school-signup-areas", county],
    queryFn: () => apiGet<SignupAreas>(`/api/school-signup/areas?county=${encodeURIComponent(county)}`),
    enabled: !!county,
  });
  // Each level offers only what sits inside the one above it; a name no school
  // has placed yet (only a championship names it) is offered everywhere.
  const zoneOptions = (areas?.zones ?? []).filter((z) => !z.subcounty || !subcounty || sameArea(z.subcounty, subcounty));
  const baseOptions = (areas?.bases ?? []).filter((b) => !b.zone || !zone?.trim() || sameArea(b.zone, zone));

  async function onSubmit(values: SchoolSignupInput) {
    setSubmitting(true);
    try {
      await apiPost("/api/school-signup", values);
      toast.success("School signed up! Signing you in...");
      const result = await signIn("credentials", { email: values.email, password: values.password, redirect: false });
      if (result?.error) {
        toast.error("School signed up, but automatic sign-in failed. Please log in.");
        router.push("/login");
        return;
      }
      router.push("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Signup failed");
    } finally {
      setSubmitting(false);
    }
  }

  const field = (id: keyof SchoolSignupInput, label: string, node: React.ReactNode) => (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1.5">{node}</div>
      {errors[id] && <p className="mt-1 text-sm text-destructive">{errors[id]?.message}</p>}
    </div>
  );

  return (
    <div className="container max-w-xl py-16">
      <Card>
        <CardHeader>
          <CardTitle>Sign up your school</CardTitle>
          <CardDescription>Use your school&apos;s KNEC code. Each code can only be used once.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {field("schoolName", "School name", <Input id="schoolName" {...register("schoolName")} />)}
            {field(
              "county",
              "County",
              <Select
                value={county}
                onValueChange={(value) => {
                  setValue("county", value, { shouldValidate: true });
                  setValue("subcounty", "");
                  setValue("zone", "");
                  setValue("baseName", "");
                }}
              >
                <SelectTrigger id="county"><SelectValue placeholder="Select a county" /></SelectTrigger>
                <SelectContent>
                  {KENYA_COUNTIES.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>,
            )}
            {field(
              "subcounty",
              "Sub-county",
              <Select value={watch("subcounty")} onValueChange={(value) => setValue("subcounty", value, { shouldValidate: true })} disabled={!county}>
                <SelectTrigger id="subcounty"><SelectValue placeholder="Select a sub-county" /></SelectTrigger>
                <SelectContent>
                  {subcounties.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>,
            )}
            {county && (
              <p className="text-sm text-muted">
                Region: {regionOfCounty(county)} - KNEC codes here start with {countyCode(county)}
              </p>
            )}
            {field(
              "zone",
              "Zone",
              <>
                <Input id="zone" list="zone-options" autoComplete="off" {...register("zone")} />
                <datalist id="zone-options">
                  {zoneOptions.map((z) => <option key={z.name} value={z.name} />)}
                </datalist>
              </>,
            )}
            {field(
              "baseName",
              "Inter School base",
              <>
                <Input id="baseName" list="base-options" autoComplete="off" {...register("baseName")} />
                <datalist id="base-options">
                  {baseOptions.map((b) => <option key={b.name} value={b.name} />)}
                </datalist>
                <p className="mt-1 text-xs text-muted">
                  Pick your zone and base from the lists if they&apos;re there. A base belongs to one zone and a zone to one
                  sub-county, so they must match the schools already signed up.
                </p>
              </>,
            )}
            {field("knecCode", "School KNEC code", <Input id="knecCode" inputMode="numeric" {...register("knecCode")} />)}
            {field("contactName", "Teacher's name", <Input id="contactName" {...register("contactName")} />)}
            {field("email", "Email", <Input id="email" type="email" {...register("email")} />)}
            {field("phone", "Phone", <Input id="phone" {...register("phone")} />)}
            {field("password", "Password", <PasswordInput id="password" {...register("password")} />)}
            {field("confirmPassword", "Confirm password", <PasswordInput id="confirmPassword" {...register("confirmPassword")} />)}
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? "Signing up..." : "Sign up school"}
            </Button>
            <p className="text-center text-xs text-muted">
              By signing up you agree to our{" "}
              <Link href="/terms" className="text-primary hover:underline">Terms of Use</Link> and{" "}
              <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
