"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Star, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiDelete, apiGet, apiPost } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface MyTestimonial {
  id: string;
  message: string;
  rating: number | null;
  status: "SUBMITTED" | "FEATURED" | "ARCHIVED";
}

// Dismissing the prompt hides it for a while, not forever - it's re-offered
// after this many days.
const DISMISS_DAYS = 14;

function dismissKey(userId: string) {
  return `testimonial-dismissed:${userId}`;
}

function readDismissedRecently(userId: string): boolean {
  try {
    const dismissedAt = Number(localStorage.getItem(dismissKey(userId)) || 0);
    return !!dismissedAt && (Date.now() - dismissedAt) / 86_400_000 < DISMISS_DAYS;
  } catch {
    return false;
  }
}

/**
 * Asks a dashboard user for a short written testimonial about their real
 * experience with Zaroda Sports. Once submitted, shows it back (with a delete
 * option) instead of asking again.
 */
export function TestimonialPrompt({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = React.useState(true); // hidden until we know it's wanted
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState({ message: "", rating: 5, allowPublicUse: true });

  React.useEffect(() => setDismissed(readDismissedRecently(userId)), [userId]);

  const { data, isLoading } = useQuery({
    queryKey: ["my-testimonial"],
    queryFn: () => apiGet<{ testimonial: MyTestimonial | null }>("/api/testimonials/mine"),
  });
  const mine = data?.testimonial ?? null;

  const submitMutation = useMutation({
    mutationFn: () => apiPost("/api/testimonials", form),
    onSuccess: () => {
      toast.success("Thank you - your testimonial has been recorded.");
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["my-testimonial"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to submit testimonial"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/testimonials/${id}`),
    onSuccess: () => {
      toast.success("Testimonial removed.");
      setForm({ message: "", rating: 5, allowPublicUse: true });
      queryClient.invalidateQueries({ queryKey: ["my-testimonial"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to remove testimonial"),
  });

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(dismissKey(userId), String(Date.now()));
    } catch {
      // Storage unavailable - it just reappears next visit.
    }
  }

  // An already-submitted testimonial always shows (so it can be deleted);
  // the write-one prompt respects a recent dismissal.
  if (isLoading || (!mine && dismissed)) return null;

  return (
    <Card className="relative border-primary/30 bg-primary/5">
      <CardContent className="py-5">
        {!mine && (
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="absolute right-4 top-4 text-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {mine ? (
          <div>
            <h3 className="mb-1 font-bold text-foreground">Your testimonial</h3>
            <p className="mb-3 text-sm italic text-muted">&ldquo;{mine.message}&rdquo;</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(mine.id)}
              >
                {deleteMutation.isPending ? "Removing..." : "Delete"}
              </Button>
              {mine.status === "FEATURED" && (
                <span className="text-xs font-semibold text-primary">Featured on the Zaroda Sports homepage</span>
              )}
            </div>
          </div>
        ) : !showForm ? (
          <div className="pr-6">
            <h3 className="mb-1 font-bold text-foreground">Share your experience with Zaroda Sports</h3>
            <p className="mb-3 text-sm text-muted">
              A short testimonial helps us understand and showcase the real impact this system has on running school and
              open championships in Kenya.
            </p>
            <Button size="sm" onClick={() => setShowForm(true)}>
              Write a testimonial
            </Button>
          </div>
        ) : (
          <div className="space-y-3 pr-6">
            <Textarea
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              rows={4}
              maxLength={1000}
              placeholder="How has Zaroda Sports changed the way you register teams, capture results, or run your championships?"
            />
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={form.rating === n}
                    aria-label={`${n} star${n === 1 ? "" : "s"}`}
                    onClick={() => setForm((f) => ({ ...f, rating: n }))}
                  >
                    <Star className={cn("h-5 w-5", n <= form.rating ? "fill-gold text-gold" : "text-muted")} />
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={form.allowPublicUse}
                  onChange={(e) => setForm((f) => ({ ...f, allowPublicUse: e.target.checked }))}
                />
                OK to use publicly (with my name)
              </label>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={submitMutation.isPending || !form.message.trim()}
                onClick={() => submitMutation.mutate()}
              >
                {submitMutation.isPending ? "Submitting..." : "Submit"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
