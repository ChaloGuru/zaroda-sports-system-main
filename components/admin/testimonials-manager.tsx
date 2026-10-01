"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiDelete, apiGet, apiPatch } from "@/lib/api-client";
import { cn, formatDate } from "@/lib/utils";

type Status = "SUBMITTED" | "FEATURED" | "ARCHIVED";

interface TestimonialRow {
  id: string;
  authorName: string;
  authorRole: string;
  organizationName: string | null;
  message: string;
  rating: number | null;
  allowPublicUse: boolean;
  status: Status;
  createdAt: string;
  championshipsRun: number;
}

const FILTERS = [
  { value: "ACTIVE", label: "Submitted & featured" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "FEATURED", label: "Featured" },
  { value: "ARCHIVED", label: "Archived" },
  { value: "ALL", label: "All" },
];

const STATUS_BADGE: Record<Status, "outline" | "success" | "secondary"> = {
  SUBMITTED: "outline",
  FEATURED: "success",
  ARCHIVED: "secondary",
};

export function TestimonialsManager() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = React.useState("ACTIVE");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-testimonials", filter],
    queryFn: () =>
      apiGet<{ testimonials: TestimonialRow[] }>(
        filter === "ACTIVE" ? "/api/testimonials" : `/api/testimonials?status=${filter}`,
      ),
  });
  const items = data?.testimonials ?? [];

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Status }) => apiPatch(`/api/testimonials/${id}`, { status }),
    onSuccess: () => {
      toast.success("Updated");
      queryClient.invalidateQueries({ queryKey: ["admin-testimonials"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/testimonials/${id}`),
    onSuccess: () => {
      toast.success("Deleted");
      queryClient.invalidateQueries({ queryKey: ["admin-testimonials"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not delete"),
  });

  function copyAll() {
    const text = items
      .map(
        (t) =>
          `"${t.message}"\n- ${t.authorName}, ${t.authorRole}${t.organizationName ? `, ${t.organizationName}` : ""}${
            t.rating ? ` (${t.rating}/5)` : ""
          }`,
      )
      .join("\n\n");
    navigator.clipboard
      ?.writeText(text)
      .then(() => toast.success("Copied - paste into your evidence document."))
      .catch(() => toast.error("Could not copy to clipboard"));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={copyAll} disabled={items.length === 0}>
          <Copy className="h-3.5 w-3.5" /> Copy all
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted">Loading...</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted">No testimonials here yet.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((t) => (
            <Card key={t.id}>
              <CardContent className="space-y-3 py-4">
                <p className="text-sm italic text-foreground">&ldquo;{t.message}&rdquo;</p>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{t.authorName}</p>
                    <p className="text-xs text-muted">
                      {t.authorRole}
                      {t.organizationName ? ` · ${t.organizationName}` : ""} · {formatDate(t.createdAt)}
                    </p>
                    <p
                      className={cn(
                        "text-xs font-semibold",
                        t.championshipsRun > 0 ? "text-green-600 dark:text-green-400" : "text-destructive",
                      )}
                    >
                      {t.championshipsRun > 0
                        ? `✓ Verified: ${t.championshipsRun} championship${t.championshipsRun === 1 ? "" : "s"} run on Zaroda Sports`
                        : "⚠ This account has run 0 championships - check the wording before featuring"}
                    </p>
                    {t.rating && <Stars rating={t.rating} />}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Badge variant={STATUS_BADGE[t.status]}>{t.status.toLowerCase()}</Badge>
                      {!t.allowPublicUse && <Badge variant="outline">private - not for public use</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {t.status !== "FEATURED" && (
                      <Button
                        size="sm"
                        disabled={!t.allowPublicUse || statusMutation.isPending}
                        title={t.allowPublicUse ? undefined : "The author didn't agree to public use"}
                        onClick={() => statusMutation.mutate({ id: t.id, status: "FEATURED" })}
                      >
                        Feature
                      </Button>
                    )}
                    {t.status === "FEATURED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={statusMutation.isPending}
                        onClick={() => statusMutation.mutate({ id: t.id, status: "SUBMITTED" })}
                      >
                        Unfeature
                      </Button>
                    )}
                    {t.status !== "ARCHIVED" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={statusMutation.isPending}
                        onClick={() => statusMutation.mutate({ id: t.id, status: "ARCHIVED" })}
                      >
                        Archive
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (confirm("Permanently delete this testimonial?")) deleteMutation.mutate(t.id);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex" aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={cn("h-3.5 w-3.5", i < rating ? "fill-gold text-gold" : "text-muted")} />
      ))}
    </div>
  );
}
