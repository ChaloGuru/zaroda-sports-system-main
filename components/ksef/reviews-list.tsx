"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { apiGet } from "@/lib/api-client";
import { LEVEL_LABELS } from "@/lib/utils";
import type { Level } from "@prisma/client";

interface ReviewRow {
  id: string;
  level: Level;
  status: "OPEN" | "APPROVED";
  spread: number;
  finalScore: number | null;
  approvedAt: string | null;
  approvedBy: { name: string } | null;
  conflict: boolean;
  project: { code: string | null; title: string; category: { name: string }; school: { name: string } };
}

/** Projects flagged for a judging discrepancy - open ones first. */
export function ReviewsList({ editionId, basePath }: { editionId: string; basePath: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["ksef-reviews", editionId],
    queryFn: () => apiGet<{ reviews: ReviewRow[] }>(`/api/ksef/reviews?editionId=${editionId}`),
  });
  const reviews = data?.reviews ?? [];
  const open = reviews.filter((r) => r.status === "OPEN").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Judging discrepancy reviews</CardTitle>
        <CardDescription>
          Projects whose judges&apos; totals differ by more than this edition&apos;s configured threshold. {open} awaiting
          Chief Judge review. Results for a level can&apos;t be published while any of its reviews are open.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <p className="text-muted">Loading...</p>}
        {!isLoading && reviews.length === 0 && <p className="text-muted">No judging discrepancies have been flagged.</p>}
        {reviews.map((r) => {
          const body = (
            <>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                  {r.status === "OPEN" ? (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-[#B45309]" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#12805C]" />
                  )}
                  <span className="font-mono text-primary">{r.project.code}</span>
                  <span className="truncate">{r.project.title}</span>
                </p>
                <p className="text-sm text-muted">
                  {LEVEL_LABELS[r.level]} · {r.project.category.name} · {r.project.school.name} · judges differ by {r.spread} marks
                  {r.status === "APPROVED" && r.approvedBy ? ` · approved by ${r.approvedBy.name} (final ${r.finalScore})` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {r.conflict ? (
                  <Badge variant="secondary">You judged this - another Chief Judge reviews it</Badge>
                ) : (
                  <Badge variant={r.status === "OPEN" ? "warning" : "success"}>{r.status === "OPEN" ? "Review needed" : "Approved"}</Badge>
                )}
                {!r.conflict && <ArrowRight className="h-4 w-4 text-muted" />}
              </div>
            </>
          );
          const className = "flex items-center justify-between gap-3 rounded-md border border-border p-4";
          return r.conflict ? (
            <div key={r.id} className={`${className} opacity-70`}>
              {body}
            </div>
          ) : (
            <Link key={r.id} href={`${basePath}/${r.id}`} className={`${className} transition-colors hover:border-primary/50`}>
              {body}
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
