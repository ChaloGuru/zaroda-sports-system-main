"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ShareButton } from "@/components/ui/share-button";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { formatKes } from "@/lib/utils";

interface FeeRow {
  id: string;
  name: string;
  description: string | null;
  amountKes: number;
  isRequired: boolean;
}

interface FeeForm {
  name: string;
  description: string;
  amountKes: string;
  isRequired: boolean;
}

const EMPTY_FORM: FeeForm = { name: "", description: "", amountKes: "", isRequired: true };

export function FeesPanel({ championshipId, championshipName }: { championshipId: string; championshipName: string }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FeeForm>(EMPTY_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ["championship-fees", championshipId],
    queryFn: () => apiGet<{ fees: FeeRow[] }>(`/api/championship-fees?championshipId=${championshipId}`),
  });
  const fees = data?.fees ?? [];

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        championshipId,
        name: form.name,
        description: form.description || null,
        amountKes: Number(form.amountKes),
        isRequired: form.isRequired,
      };
      return editingId ? apiPatch(`/api/championship-fees/${editingId}`, payload) : apiPost("/api/championship-fees", payload);
    },
    onSuccess: () => {
      toast.success(editingId ? "Fee updated" : "Fee added");
      queryClient.invalidateQueries({ queryKey: ["championship-fees", championshipId] });
      resetForm();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to save fee"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/championship-fees/${id}`),
    onSuccess: () => {
      toast.success("Fee removed");
      queryClient.invalidateQueries({ queryKey: ["championship-fees", championshipId] });
      resetForm();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to remove fee"),
  });

  function editFee(fee: FeeRow) {
    setEditingId(fee.id);
    setForm({
      name: fee.name,
      description: fee.description ?? "",
      amountKes: fee.amountKes.toString(),
      isRequired: fee.isRequired,
    });
  }

  function confirmDelete(fee: FeeRow) {
    if (window.confirm(`Delete the "${fee.name}" fee? Teams will no longer be able to pay it.`)) {
      deleteMutation.mutate(fee.id);
    }
  }

  const registrationUrl =
    typeof window !== "undefined" ? `${window.location.origin}/register/${championshipId}` : "";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Registration link</CardTitle>
            <CardDescription>
              Share this link with teams/organizations - they fill in their details and pay directly, no account needed.
            </CardDescription>
          </div>
          {fees.length > 0 && (
            <ShareButton
              title={`${championshipName} - Team Registration`}
              message={`Register your team for ${championshipName}: ${registrationUrl}`}
              url={registrationUrl}
            />
          )}
        </CardHeader>
        <CardContent>
          {fees.length === 0 ? (
            <p className="text-muted">Add at least one entry fee below before sharing the registration link.</p>
          ) : (
            <code className="block truncate rounded-md border border-border bg-secondary/40 p-3 text-sm text-foreground">
              {registrationUrl}
            </code>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entry fees</CardTitle>
          <CardDescription>Set the amount(s) a team pays to register. Required fees must be paid; optional ones don&apos;t block registration.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-5 sm:items-end">
            <div className="sm:col-span-2">
              <Label>Name</Label>
              <Input className="mt-1.5" placeholder="Team registration fee" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Amount (KES)</Label>
              <Input type="number" min={0} className="mt-1.5" value={form.amountKes} onChange={(e) => setForm((f) => ({ ...f, amountKes: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2 pb-2">
              <input
                type="checkbox"
                id="fee-required"
                checked={form.isRequired}
                onChange={(e) => setForm((f) => ({ ...f, isRequired: e.target.checked }))}
              />
              <Label htmlFor="fee-required" className="!mb-0">Required</Label>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={!form.name.trim() || !form.amountKes || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                <Plus className="h-4 w-4" /> {editingId ? "Save changes" : "Add fee"}
              </Button>
              {editingId && (
                <Button type="button" variant="ghost" onClick={resetForm}>
                  Cancel
                </Button>
              )}
            </div>
            <div className="sm:col-span-5">
              <Label>Description (optional)</Label>
              <Input className="mt-1.5" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
          </div>

          {isLoading && <p className="text-muted">Loading fees...</p>}
          {!isLoading && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fees.map((fee) => (
                  <TableRow key={fee.id}>
                    <TableCell>
                      <p className="font-medium text-foreground">{fee.name}</p>
                      {fee.description && <p className="text-sm text-muted">{fee.description}</p>}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">{formatKes(fee.amountKes)}</TableCell>
                    <TableCell>
                      <Badge variant={fee.isRequired ? "default" : "outline"}>{fee.isRequired ? "Required" : "Optional"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => editFee(fee)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => confirmDelete(fee)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {fees.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted">No fees set up yet.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
