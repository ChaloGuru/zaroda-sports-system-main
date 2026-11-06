"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/api-client";
import { LEVEL_LABELS, formatDate } from "@/lib/utils";

interface ChampionshipOption {
  id: string;
  name: string;
  level: keyof typeof LEVEL_LABELS;
  startDate: string;
  joined: boolean;
}

/** A signed-up school's home: the championships it can join or has joined. */
export function SchoolHome() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["school-championships"],
    queryFn: () =>
      apiGet<{ school: { name: string; knecCode: string; baseName: string; county: string }; championships: ChampionshipOption[] }>(
        "/api/school-account/championships",
      ),
  });

  const join = useMutation({
    mutationFn: (championshipId: string) => apiPost("/api/school-account/championships", { championshipId }),
    onSuccess: (_data, championshipId) => {
      toast.success("Pushed - you can now register learners");
      queryClient.invalidateQueries({ queryKey: ["school-championships"] });
      router.push(`/dashboard/school/${championshipId}`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to push"),
  });

  if (isLoading) return <p className="py-16 text-center text-muted">Loading...</p>;

  const championships = data?.championships ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{data?.school.name}</h1>
        <p className="text-muted">KNEC code {data?.school.knecCode} - {data?.school.baseName}, {data?.school.county}</p>
      </div>
      {championships.length === 0 && (
        <p className="rounded-md border border-border p-4 text-muted">
          No championships are open to your school yet. The Inter School championship for your base will appear here once it&apos;s published.
        </p>
      )}
      {championships.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-4 rounded-md border border-border p-4">
          <div>
            <p className="font-medium text-foreground">{c.name}</p>
            <p className="text-sm text-muted">{LEVEL_LABELS[c.level]} - starts {formatDate(c.startDate)}</p>
          </div>
          {c.joined ? (
            <div className="flex items-center gap-2">
              <Badge variant="success">Pushed</Badge>
              <Button asChild size="sm" variant="outline"><Link href={`/dashboard/school/${c.id}`}>Register learners</Link></Button>
            </div>
          ) : (
            <Button size="sm" disabled={join.isPending} onClick={() => join.mutate(c.id)}>Push school</Button>
          )}
        </div>
      ))}
    </div>
  );
}
