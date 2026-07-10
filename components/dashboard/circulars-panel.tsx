"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, apiPost, apiDelete } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";

interface CircularRow {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  postedBy: { name: string };
}

export function CircularsPanel({ championshipId }: { championshipId: string }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["championship-circulars", championshipId],
    queryFn: () => apiGet<{ circulars: CircularRow[] }>(`/api/championship-circulars?championshipId=${championshipId}`),
  });

  const createMutation = useMutation({
    mutationFn: () => apiPost("/api/championship-circulars", { championshipId, title, body }),
    onSuccess: () => {
      toast.success("Circular posted");
      queryClient.invalidateQueries({ queryKey: ["championship-circulars", championshipId] });
      setTitle("");
      setBody("");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to post circular"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/championship-circulars/${id}`),
    onSuccess: () => {
      toast.success("Circular removed");
      queryClient.invalidateQueries({ queryKey: ["championship-circulars", championshipId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to remove circular"),
  });

  function confirmDelete(circular: CircularRow) {
    if (window.confirm(`Remove the circular "${circular.title}"?`)) {
      deleteMutation.mutate(circular.id);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Circulars</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input className="mt-1.5" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Venue change for Day 2" />
          </div>
          <div>
            <Label>Message</Label>
            <Textarea className="mt-1.5" value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Circular details..." />
          </div>
          <Button disabled={!title.trim() || !body.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
            <Plus className="h-4 w-4" /> Post circular
          </Button>
        </div>

        {isLoading && <p className="text-muted">Loading circulars...</p>}
        {!isLoading && (
          <div className="space-y-3">
            {(data?.circulars ?? []).map((c) => (
              <Card key={c.id}>
                <CardContent className="flex items-start justify-between gap-4 py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Megaphone className="h-4 w-4 text-primary" />
                      <p className="font-medium text-foreground">{c.title}</p>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{c.body}</p>
                    <p className="mt-2 text-xs text-muted">
                      Posted by {c.postedBy.name} on {formatDate(c.createdAt)}
                    </p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => confirmDelete(c)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            ))}
            {(data?.circulars ?? []).length === 0 && <p className="text-muted">No circulars posted yet.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
