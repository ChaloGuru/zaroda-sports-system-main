"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { signupSchema, type SignupInput } from "@/lib/validations";
import { apiPost } from "@/lib/api-client";
import { KENYA_COUNTIES, getSubcounties } from "@/lib/kenya-counties";

export default function SignupPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      accountType: "SCHOOL",
      gameCategory: "ATHLETICS",
      county: "",
      subcounty: "",
    },
  });

  const accountType = watch("accountType");
  const county = watch("county");
  const gameCategory = watch("gameCategory");
  const subcounties = getSubcounties(county);

  async function onSubmit(values: SignupInput) {
    setSubmitting(true);
    try {
      await apiPost("/api/signup", values);
      toast.success("Account created! Signing you in...");
      const result = await signIn("credentials", {
        email: values.email,
        password: values.password,
        redirect: false,
      });
      if (result?.error) {
        toast.error("Account created, but automatic sign-in failed. Please log in.");
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

  return (
    <div className="container grid gap-10 py-16 lg:grid-cols-2 lg:items-start">
      <div className="lg:sticky lg:top-24">
        <h1 className="text-3xl font-bold text-foreground">Create your free Zaroda account</h1>
        <p className="mt-4 text-muted">
          Base-level championships are always free and never count against any quota. Subscribe only when you're
          ready to unlock Zone through National for a specific championship.
        </p>
        <ul className="mt-6 space-y-2 text-sm text-foreground">
          <li>- Unlimited free Base championships</li>
          <li>- Digital call-room and results capture</li>
          <li>- Public results portal for parents and officials</li>
          <li>- Upgrade any time from KES 580 per level</li>
        </ul>
        <p className="mt-8 text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-primary underline">
            Log in
          </Link>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tenant registration</CardTitle>
          <CardDescription>Tell us about your school or tournament</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <Label>Account type</Label>
              <Select value={accountType} onValueChange={(v) => setValue("accountType", v as SignupInput["accountType"])}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SCHOOL">School</SelectItem>
                  <SelectItem value="OPEN_TOURNAMENT">Open Tournament</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="organizationName">Organization name</Label>
              <Input id="organizationName" className="mt-1.5" {...register("organizationName")} />
              {errors.organizationName && <p className="mt-1 text-sm text-red-400">{errors.organizationName.message}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="contactName">Contact name</Label>
                <Input id="contactName" className="mt-1.5" {...register("contactName")} />
                {errors.contactName && <p className="mt-1 text-sm text-red-400">{errors.contactName.message}</p>}
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" className="mt-1.5" {...register("phone")} />
                {errors.phone && <p className="mt-1 text-sm text-red-400">{errors.phone.message}</p>}
              </div>
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="mt-1.5"
                {...register("email")}
              />
              {errors.email && <p className="mt-1 text-sm text-red-400">{errors.email.message}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>County</Label>
                <Select value={county} onValueChange={(v) => { setValue("county", v); setValue("subcounty", ""); }}>
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
                {errors.county && <p className="mt-1 text-sm text-red-400">{errors.county.message}</p>}
              </div>
              <div>
                <Label>Sub-county</Label>
                <Select value={watch("subcounty")} onValueChange={(v) => setValue("subcounty", v)} disabled={!county}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select sub-county" />
                  </SelectTrigger>
                  <SelectContent>
                    {subcounties.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.subcounty && <p className="mt-1 text-sm text-red-400">{errors.subcounty.message}</p>}
              </div>
            </div>

            <div>
              <Label>Game category</Label>
              <Select value={gameCategory} onValueChange={(v) => setValue("gameCategory", v as SignupInput["gameCategory"])}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BALL_GAMES">Ball Games</SelectItem>
                  <SelectItem value="ATHLETICS">Athletics</SelectItem>
                  <SelectItem value="MUSIC">Music</SelectItem>
                  <SelectItem value="OTHER_GAMES">Other Games</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="mt-1.5"
                  {...register("password")}
                />
                {errors.password && <p className="mt-1 text-sm text-red-400">{errors.password.message}</p>}
              </div>
              <div>
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="mt-1.5"
                  {...register("confirmPassword")}
                />
                {errors.confirmPassword && <p className="mt-1 text-sm text-red-400">{errors.confirmPassword.message}</p>}
              </div>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? "Creating account..." : "Create free account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
