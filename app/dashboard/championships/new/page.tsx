"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { championshipCreateSchema, type ChampionshipCreateInput } from "@/lib/validations";
import { apiGet, apiPost } from "@/lib/api-client";
import { formatKes } from "@/lib/utils";
import { SCHOOL_LEVELS } from "@/lib/school-levels";

interface Plan {
  id: string;
  displayName: string;
  level: string;
  priceKes: number;
}

interface TenantMe {
  tenant: {
    id: string;
    subscriptions: Array<{ status: string; expiresAt: string | null; plan: { level: string } }>;
  };
}

const LEVELS = ["BASE", "ZONE", "SUB_COUNTY", "COUNTY", "REGIONAL", "NATIONAL"];
const CATEGORIES = ["BALL_GAMES", "ATHLETICS", "MUSIC", "OTHER_GAMES"];

export default function NewChampionshipPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);

  const { data: plans } = useQuery({
    queryKey: ["plans"],
    queryFn: () => apiGet<{ plans: Plan[] }>("/api/plans"),
  });
  const { data: tenantMe } = useQuery({
    queryKey: ["tenant-me"],
    queryFn: () => apiGet<TenantMe>("/api/tenants/me"),
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ChampionshipCreateInput>({
    resolver: zodResolver(championshipCreateSchema),
    defaultValues: { level: "BASE", schoolLevel: "PRIMARY_JS", category: "ATHLETICS", isPublished: false },
  });

  const level = watch("level");

  const hasActiveSubForLevel = (lvl: string) =>
    lvl === "BASE" ||
    (tenantMe?.tenant.subscriptions ?? []).some(
      (s) => s.plan.level === lvl && s.status === "ACTIVE" && (!s.expiresAt || new Date(s.expiresAt) > new Date()),
    );

  const needsUpgrade = level !== "BASE" && !hasActiveSubForLevel(level);
  const planForLevel = plans?.plans.find((p) => p.level === level);

  async function handleSubscribe() {
    if (!planForLevel) return;
    try {
      const result = await apiPost<{ authorizationUrl: string }>("/api/payments/initialize", {
        mode: "subscription",
        planId: planForLevel.id,
      });
      window.location.href = result.authorizationUrl;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start checkout");
    }
  }

  async function onSubmit(values: ChampionshipCreateInput) {
    if (needsUpgrade) {
      toast.error("Upgrade required for this level before you can create the championship");
      return;
    }
    setSubmitting(true);
    try {
      const result = await apiPost<{ championship: { id: string } }>("/api/championships", values);
      toast.success("Championship created");
      router.push(`/dashboard/championships/${result.championship.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create championship");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground">New championship</h1>
      <p className="mt-1 text-muted">Base level is free forever. Zone and above require an Essential subscription.</p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Championship details</CardTitle>
          <CardDescription>You can publish it later once games and participants are set up.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" className="mt-1.5" {...register("name")} />
              {errors.name && <p className="mt-1 text-sm text-red-400">{errors.name.message}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Level</Label>
                <Select value={level} onValueChange={(v) => setValue("level", v as ChampionshipCreateInput["level"])}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>School level</Label>
                <Select
                  value={watch("schoolLevel")}
                  onValueChange={(v) => setValue("schoolLevel", v as ChampionshipCreateInput["schoolLevel"])}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHOOL_LEVELS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {needsUpgrade && (
              <div className="flex items-start gap-3 rounded-md border border-[#8A6412]/30 bg-[#FBF2DC] p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#8A6412]" />
                <div className="flex-1">
                  <p className="font-medium text-foreground">Upgrade required for {level.replace("_", " ")}</p>
                  <p className="text-sm text-muted">
                    Subscribe for {planForLevel ? formatKes(planForLevel.priceKes) : "..."} to unlock this level.
                  </p>
                  <Button type="button" size="sm" className="mt-3" onClick={handleSubscribe} disabled={!planForLevel}>
                    Subscribe now
                  </Button>
                </div>
              </div>
            )}

            <div>
              <Label>Category</Label>
              <Select value={watch("category")} onValueChange={(v) => setValue("category", v as ChampionshipCreateInput["category"])}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="county">County</Label>
                <Input id="county" className="mt-1.5" {...register("county")} />
                {errors.county && <p className="mt-1 text-sm text-red-400">{errors.county.message}</p>}
              </div>
              <div>
                <Label htmlFor="location">Location / venue</Label>
                <Input id="location" className="mt-1.5" {...register("location")} />
                {errors.location && <p className="mt-1 text-sm text-red-400">{errors.location.message}</p>}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="startDate">Start date</Label>
                <Input id="startDate" type="date" className="mt-1.5" {...register("startDate")} />
                {errors.startDate && <p className="mt-1 text-sm text-red-400">{errors.startDate.message}</p>}
              </div>
              <div>
                <Label htmlFor="endDate">End date</Label>
                <Input id="endDate" type="date" className="mt-1.5" {...register("endDate")} />
                {errors.endDate && <p className="mt-1 text-sm text-red-400">{errors.endDate.message}</p>}
              </div>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={submitting || needsUpgrade}>
              {submitting ? "Creating..." : "Create championship"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
