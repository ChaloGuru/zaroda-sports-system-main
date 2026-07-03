"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GenderBadge } from "@/components/ui/gender-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { dashboardTournamentTeamSchema, type TournamentTeamInput } from "@/lib/validations";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";

interface GameOption {
  id: string;
  name: string;
  gender: string;
}

interface TeamRow {
  id: string;
  name: string;
  teamCode: string | null;
  gameId: string | null;
  gender: string;
  teamColor: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  county: string | null;
}

function emptyDefaults(championshipId: string): TournamentTeamInput {
  return { championshipId, gameId: "", name: "" };
}

export function TeamsPanel({ championshipId }: { championshipId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkText, setBulkText] = React.useState("");

  const { data: gamesData } = useQuery({
    queryKey: ["games", championshipId],
    queryFn: () => apiGet<{ games: GameOption[] }>(`/api/games?championshipId=${championshipId}`),
  });
  const games = gamesData?.games ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ["tournament-teams", championshipId],
    queryFn: () => apiGet<{ teams: TeamRow[] }>(`/api/tournament-teams?championshipId=${championshipId}`),
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<TournamentTeamInput>({
    resolver: zodResolver(dashboardTournamentTeamSchema),
    defaultValues: emptyDefaults(championshipId),
  });

  function openCreate() {
    setEditingId(null);
    reset(emptyDefaults(championshipId));
    setOpen(true);
  }

  function openEdit(team: TeamRow) {
    setEditingId(team.id);
    reset({
      championshipId,
      gameId: team.gameId ?? "",
      name: team.name,
      teamCode: team.teamCode,
      teamColor: team.teamColor,
      contactName: team.contactName,
      contactEmail: team.contactEmail,
      contactPhone: team.contactPhone,
      county: team.county,
    });
    setOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: (values: TournamentTeamInput) =>
      editingId ? apiPatch(`/api/tournament-teams/${editingId}`, values) : apiPost("/api/tournament-teams", values),
    onSuccess: () => {
      toast.success(editingId ? "Team updated" : "Team added");
      queryClient.invalidateQueries({ queryKey: ["tournament-teams", championshipId] });
      setOpen(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to save team"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/tournament-teams/${id}`),
    onSuccess: () => {
      toast.success("Team deleted");
      queryClient.invalidateQueries({ queryKey: ["tournament-teams", championshipId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to delete team"),
  });

  function confirmDelete(team: TeamRow) {
    if (window.confirm(`Delete "${team.name}"? This fails if the team already has participants or fixtures.`)) {
      deleteMutation.mutate(team.id);
    }
  }

  const bulkMutation = useMutation({
    mutationFn: (organizationNames: string[]) =>
      apiPost<{ created: number; skipped: number }>("/api/tournament-teams/bulk", { championshipId, organizationNames }),
    onSuccess: (result) => {
      toast.success(
        `${result.created} team${result.created === 1 ? "" : "s"} created` +
          (result.skipped > 0 ? ` (${result.skipped} already existed)` : ""),
      );
      queryClient.invalidateQueries({ queryKey: ["tournament-teams", championshipId] });
      setBulkOpen(false);
      setBulkText("");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to add organizations"),
  });

  function submitBulk() {
    const organizationNames = bulkText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (organizationNames.length === 0) {
      toast.error("Enter at least one organization name");
      return;
    }
    bulkMutation.mutate(organizationNames);
  }

  function gameName(gameId: string | null): string {
    if (!gameId) return "No game selected";
    return games.find((g) => g.id === gameId)?.name ?? "Unknown game";
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Teams</CardTitle>
          <CardDescription>Teams register for a specific game - gender comes from the game, not asked separately.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="secondary" disabled={games.length === 0}>
                <Users className="h-4 w-4" /> Add organizations
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add participating organizations</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="bulk-orgs">One organization/school name per line</Label>
                  <Textarea
                    id="bulk-orgs"
                    className="mt-1.5 min-h-[160px]"
                    placeholder={"Manyonge Primary\nOruba Primary\nSt. Mary's Primary"}
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                  />
                  <p className="mt-1.5 text-xs text-muted">
                    Creates a team for each organization in every one of this championship&apos;s {games.length} game
                    {games.length === 1 ? "" : "s"}. Already-existing organization/game combinations are skipped.
                  </p>
                </div>
                <Button className="w-full" disabled={bulkMutation.isPending} onClick={submitBulk}>
                  {bulkMutation.isPending ? "Adding..." : "Add organizations"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreate} disabled={games.length === 0}>
                <Plus className="h-4 w-4" /> Add team
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit team" : "Add a team"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
              <div>
                <Label htmlFor="team-name">Name</Label>
                <Input id="team-name" className="mt-1.5" {...register("name")} />
                {errors.name && <p className="mt-1 text-sm text-red-400">{errors.name.message}</p>}
              </div>

              <div>
                <Label>Game</Label>
                <Select value={watch("gameId") ?? ""} onValueChange={(v) => setValue("gameId", v)}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select a game" /></SelectTrigger>
                  <SelectContent>
                    {games.map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.name} ({g.gender})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.gameId && <p className="mt-1 text-sm text-red-400">{errors.gameId.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="team-code">Team code (optional)</Label>
                  <Input id="team-code" className="mt-1.5" {...register("teamCode")} />
                </div>
                <div>
                  <Label htmlFor="team-color">Team color (optional)</Label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Input
                      id="team-color"
                      type="color"
                      className="h-10 w-14 cursor-pointer p-1"
                      {...register("teamColor")}
                    />
                    {watch("teamColor") && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setValue("teamColor", "")}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Shown as a color accent on standings tables - helps a team's row stand out at a glance.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="contactName">Contact name (optional)</Label>
                  <Input id="contactName" className="mt-1.5" {...register("contactName")} />
                </div>
                <div>
                  <Label htmlFor="contactPhone">Contact phone (optional)</Label>
                  <Input id="contactPhone" className="mt-1.5" {...register("contactPhone")} />
                </div>
              </div>

              <div>
                <Label htmlFor="contactEmail">Contact email (optional)</Label>
                <Input id="contactEmail" type="email" className="mt-1.5" {...register("contactEmail")} />
                {errors.contactEmail && <p className="mt-1 text-sm text-red-400">{errors.contactEmail.message}</p>}
              </div>

              <div>
                <Label htmlFor="county">County</Label>
                <Input id="county" className="mt-1.5" {...register("county")} placeholder="e.g. Kisumu" />
                <p className="mt-1 text-xs text-muted">
                  Required for championships below Regional/National level - used to confirm the team is within the
                  championship's geographic scope.
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editingId ? "Save changes" : "Add team"}
              </Button>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {games.length === 0 && (
          <p className="text-muted">Add a game in the Games tab first - teams register for a specific game.</p>
        )}
        {isLoading && <p className="text-muted">Loading teams...</p>}
        {!isLoading && games.length > 0 && (data?.teams ?? []).length === 0 && <p className="text-muted">No teams yet. Add your first team.</p>}
        {(data?.teams ?? []).map((team) => (
          <div key={team.id} className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-foreground">{team.name}</p>
                <GenderBadge gender={team.gender} />
              </div>
              <p className="text-sm text-muted">
                {gameName(team.gameId)}
                {team.teamCode ? ` - ${team.teamCode}` : ""}
                {team.contactName ? ` - ${team.contactName}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {team.teamColor && (
                <span
                  className="h-5 w-5 rounded-full border border-border"
                  style={{ backgroundColor: team.teamColor }}
                  title={team.teamColor}
                />
              )}
              <Button size="icon" variant="ghost" onClick={() => openEdit(team)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => confirmDelete(team)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
