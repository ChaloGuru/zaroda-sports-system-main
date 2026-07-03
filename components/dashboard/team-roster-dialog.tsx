"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Plus, Trash2, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PrintButton } from "@/components/ui/print-button";
import { apiGet, apiPost, apiDelete } from "@/lib/api-client";
import { downloadTeamRosterPdf } from "@/lib/export-team-roster-pdf";

interface RosterPlayer {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  playingPosition: string | null;
}

export function TeamRosterDialog({
  championshipId,
  championshipName,
  teamId,
  teamName,
  gameId,
  gender,
}: {
  championshipId: string;
  championshipName: string;
  teamId: string;
  teamName: string;
  gameId: string;
  gender: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [form, setForm] = React.useState({ firstName: "", lastName: "", jerseyNumber: "", playingPosition: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["team-roster", teamId],
    queryFn: () => apiGet<{ participants: RosterPlayer[] }>(`/api/participants?tournamentTeamId=${teamId}`),
    enabled: open,
  });
  const players = data?.participants ?? [];

  const addMutation = useMutation({
    mutationFn: () =>
      apiPost("/api/participants", {
        championshipId,
        gameId,
        tournamentTeamId: teamId,
        firstName: form.firstName,
        lastName: form.lastName,
        gender,
        jerseyNumber: form.jerseyNumber ? Number(form.jerseyNumber) : undefined,
        playingPosition: form.playingPosition || undefined,
      }),
    onSuccess: () => {
      toast.success("Player added");
      setForm({ firstName: "", lastName: "", jerseyNumber: "", playingPosition: "" });
      queryClient.invalidateQueries({ queryKey: ["team-roster", teamId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to add player"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/participants/${id}`),
    onSuccess: () => {
      toast.success("Player removed");
      queryClient.invalidateQueries({ queryKey: ["team-roster", teamId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to remove player"),
  });

  async function download() {
    setDownloading(true);
    try {
      await downloadTeamRosterPdf(championshipName, teamName, players);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download roster");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Roster">
          <Users className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <DialogTitle>{teamName} - Roster</DialogTitle>
            <div className="no-print mr-6 flex items-center gap-2">
              <PrintButton />
              <Button variant="outline" size="sm" onClick={download} disabled={downloading || players.length === 0}>
                <FileDown className="h-4 w-4" /> {downloading ? "..." : "PDF"}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-[80px_1fr_1fr_1fr_auto] items-end gap-2">
            <div>
              <Label htmlFor="roster-jersey">#</Label>
              <Input
                id="roster-jersey"
                type="number"
                className="mt-1.5"
                value={form.jerseyNumber}
                onChange={(e) => setForm({ ...form, jerseyNumber: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="roster-first">First name</Label>
              <Input
                id="roster-first"
                className="mt-1.5"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="roster-last">Last name</Label>
              <Input
                id="roster-last"
                className="mt-1.5"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="roster-position">Position (optional)</Label>
              <Input
                id="roster-position"
                className="mt-1.5"
                placeholder="e.g. Striker"
                value={form.playingPosition}
                onChange={(e) => setForm({ ...form, playingPosition: e.target.value })}
              />
            </div>
            <Button
              className="no-print"
              size="icon"
              disabled={!form.firstName || !form.lastName || addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {isLoading && <p className="text-sm text-muted">Loading roster...</p>}
          {!isLoading && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead className="no-print text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {players.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.jerseyNumber ?? "-"}</TableCell>
                    <TableCell>{p.firstName} {p.lastName}</TableCell>
                    <TableCell>{p.playingPosition ?? "-"}</TableCell>
                    <TableCell className="no-print text-right">
                      <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(p.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {players.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted">
                      No players added yet - the roster is optional.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
