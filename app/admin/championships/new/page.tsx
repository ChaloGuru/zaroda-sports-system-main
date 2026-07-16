"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { championshipCreateSchema, type ChampionshipCreateInput } from "@/lib/validations";
import { apiGet, apiPost } from "@/lib/api-client";
import { SCHOOL_LEVELS } from "@/lib/school-levels";

interface TenantOption {
  id: string;
  organizationName: string;
}

const LEVELS = ["BASE", "ZONE", "SUB_COUNTY", "COUNTY", "REGIONAL", "NATIONAL", "OPEN_TOURNAMENT"];
const CATEGORIES = ["BALL_GAMES", "ATHLETICS", "MUSIC", "OTHER_GAMES"];

export default function AdminNewChampionshipPage() {
  const router = useRouter();
  const [tenantId, setTenantId] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const { data: tenants } = useQuery({
    queryKey: ["admin-tenants-lite"],
    queryFn: () => apiGet<{ tenants: TenantOption[] }>("/api/tenants"),
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

  async function onSubmit(values: ChampionshipCreateInput) {
    if (!tenantId) {
      toast.error("Select a tenant to create this championship for");
      return;
    }
    setSubmitting(true);
    try {
      const result = await apiPost<{ championship: { id: string } }>("/api/championships", { ...values, tenantId });
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
      <h1 className="text-2xl font-bold text-foreground">New championship (as super admin)</h1>
      <p className="mt-1 text-muted">Super admins can create championships at any level, free of charge, for any tenant.</p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Championship details</CardTitle>
          <CardDescription>Select the tenant this championship belongs to.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <Label>Tenant</Label>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select tenant" /></SelectTrigger>
                <SelectContent>
                  {(tenants?.tenants ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.organizationName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" className="mt-1.5" {...register("name")} />
              {errors.name && <p className="mt-1 text-sm text-red-400">{errors.name.message}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Level</Label>
                <Select value={watch("level")} onValueChange={(v) => setValue("level", v as ChampionshipCreateInput["level"])}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => (
                      <SelectItem key={l} value={l}>{l.replace("_", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>School level</Label>
                <Select value={watch("schoolLevel")} onValueChange={(v) => setValue("schoolLevel", v as ChampionshipCreateInput["schoolLevel"])}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCHOOL_LEVELS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Category</Label>
              <Select value={watch("category")} onValueChange={(v) => setValue("category", v as ChampionshipCreateInput["category"])}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>
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

            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? "Creating..." : "Create championship"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
