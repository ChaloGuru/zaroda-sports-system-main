"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { apiGet } from "@/lib/api-client";
import { KSEF_DIVISION_LABELS } from "@/lib/ksef-config";
import { LEVEL_LABELS } from "@/lib/utils";
import type { KsefDivision, Level } from "@prisma/client";

interface MyAssignment {
  id: string;
  level: Level;
  submittedAt: string | null;
  judge: { edition: { id: string; name: string } };
  project: {
    code: string | null;
    title: string;
    category: { name: string; division: KsefDivision };
    school: { name: string };
  };
}

/** A judge's assigned KSEF projects, unscored first. */
export function MyJudging() {
  const { data, isLoading } = useQuery({
    queryKey: ["ksef-my-assignments"],
    queryFn: () => apiGet<{ assignments: MyAssignment[] }>("/api/ksef/my-assignments"),
  });
  const assignments = data?.assignments ?? [];
  const pending = assignments.filter((a) => !a.submittedAt).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects to judge</CardTitle>
        <CardDescription>
          {assignments.length === 0 ? "No projects are assigned to you yet." : `${pending} of ${assignments.length} still to score.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <p className="text-muted">Loading...</p>}
        {assignments.map((a) => (
          <Link
            key={a.id}
            href={`/dashboard/ksef-judging/${a.id}`}
            className="flex items-center justify-between gap-3 rounded-md border border-border p-4 transition-colors hover:border-primary/50"
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                {a.project.code && <span className="font-mono text-primary">{a.project.code}</span>}
                <span className="truncate">{a.project.title}</span>
              </p>
              <p className="text-sm text-muted">
                {a.judge.edition.name} · {LEVEL_LABELS[a.level]} · {KSEF_DIVISION_LABELS[a.project.category.division]} ·{" "}
                {a.project.category.name}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant={a.submittedAt ? "success" : "warning"}>{a.submittedAt ? "Submitted" : "To score"}</Badge>
              <ArrowRight className="h-4 w-4 text-muted" />
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
