"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { loginSchema, type LoginInput } from "@/lib/validations";

export default function LoginPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    setSubmitting(true);
    try {
      const result = await signIn("credentials", { ...values, redirect: false });
      if (result?.error) {
        toast.error("Invalid email or password");
        return;
      }
      toast.success("Welcome back!");
      router.push("/dashboard");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container flex min-h-[calc(100vh-4rem)] items-center justify-center py-16">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <Image src="/images/logo.png" alt="Zaroda Sports Management System" width={216} height={144} className="h-16 w-auto" priority />
          <CardTitle>Log in to Zaroda Sports</CardTitle>
          <CardDescription>Manage your championships, games, and results</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="mt-1.5"
                {...register("password")}
              />
              {errors.password && <p className="mt-1 text-sm text-red-400">{errors.password.message}</p>}
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? "Signing in..." : "Log in"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted">
            No account yet?{" "}
            <Link href="/signup" className="text-primary underline">
              Sign up free
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
