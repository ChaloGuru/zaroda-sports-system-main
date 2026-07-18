"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { UserPlus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { participantCreateSchema, type ParticipantCreateInput } from "@/lib/validations";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";

interface GameOption {
  id: string;
  name: string;
  isTimed: boolean;
}

interface SchoolOption {
  id: string;
  name: string;
}

interface TeamOption {
  id: string;
  name: string;
}

interface ParticipantRow {
  id: string;
  firstName: string;
  lastName: string;
  bibNumber: number;
  gender: string;
  status: string;
  school: { name: string } | null;
  tournamentTeam: { name: string } | null;
}

interface EditForm {
  firstName: string;
  lastName: string;
  gender: string;
  bibNumber: string;
}

function EditParticipantDialog({
  participant,
  onClose,
  onSaved,
}: {
  participant: ParticipantRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState<EditForm>({
    firstName: participant.firstName,
    lastName: participant.lastName,
    gender: participant.gender,
    bibNumber: participant.bibNumber.toString(),
  });
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiPatch(`/api/participants/${participant.id}`, {
        firstName: form.firstName,
        lastName: form.lastName,
        gender: form.gender,
        bibNumber: Number(form.bibNumber),
      });
      toast.success("Participant updated");
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update participant");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit participant</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edit-firstName">First name</Label>
              <Input
                id="edit-firstName"
                className="mt-1.5"
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="edit-lastName">Last name</Label>
              <Input
                id="edit-lastName"
                className="mt-1.5"
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={(v) => setForm((f) => ({ ...f, gender: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOYS">Boys</SelectItem>
                  <SelectItem value="GIRLS">Girls</SelectItem>
                  <SelectItem value="MIXED">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-bibNumber">Bib number</Label>
              <Input
                id="edit-bibNumber"
                type="number"
                className="mt-1.5"
                value={form.bibNumber}
                onChange={(e) => setForm((f) => ({ ...f, bibNumber: e.target.value }))}
              />
            </div>
          </div>
          <Button className="w-full" disabled={saving} onClick={save}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ParticipantsPanel({
  championshipId,
  isOpenTournament,
}: {
  championshipId: string;
  /** Open tournaments aren't school-based - participants belong to a registered organization/team, not a School. */
  isOpenTournament?: boolean;
}) {
  const queryClient = useQueryClient();
  const [gameId, setGameId] = React.useState<string>("");
  const [open, setOpen] = React.useState(false);
  const [editingParticipant, setEditingParticipant] = React.useState<ParticipantRow | null>(null);

  const { data: gamesData } = useQuery({
    queryKey: ["games", championshipId],
    queryFn: () => apiGet<{ games: GameOption[] }>(`/api/games?championshipId=${championshipId}`),
  });
  // School-ladder championships: only schools actually participating in THIS
  // championship (i.e. allocated a bib range here) should be selectable -
  // not the entire nationwide school directory.
  const { data: bibRangesData } = useQuery({
    queryKey: ["bib-ranges", championshipId],
    queryFn: () => apiGet<{ ranges: Array<{ schoolId: string; school: { name: string } }> }>(`/api/bib-ranges?championshipId=${championshipId}`),
    enabled: !isOpenTournament,
  });
  const schools: SchoolOption[] = (bibRangesData?.ranges ?? []).map((r) => ({ id: r.schoolId, name: r.school.name }));
  // Open tournaments: participants belong to a registered organization/team
  // instead of a School.
  const { data: teamsData } = useQuery({
    queryKey: ["tournament-teams", championshipId],
    queryFn: () => apiGet<{ teams: TeamOption[] }>(`/api/tournament-teams?championshipId=${championshipId}`),
    enabled: !!isOpenTournament,
  });
  const teams = teamsData?.teams ?? [];

  const { data: participantsData, isLoading } = useQuery({
    queryKey: ["participants", gameId],
    queryFn: () => apiGet<{ participants: ParticipantRow[] }>(`/api/participants?gameId=${gameId}`),
    enabled: !!gameId,
  });

  function refetchParticipants() {
    queryClient.invalidateQueries({ queryKey: ["participants", gameId] });
  }

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ParticipantCreateInput>({
    resolver: zodResolver(participantCreateSchema),
    defaultValues: { championshipId, gameId, gender: "BOYS" },
  });

  React.useEffect(() => {
    setValue("gameId", gameId);
  }, [gameId, setValue]);

  const createMutation = useMutation({
    mutationFn: (values: ParticipantCreateInput) => apiPost("/api/participants", values),
    onSuccess: () => {
      toast.success("Participant registered");
      refetchParticipants();
      setOpen(false);
      reset({ championshipId, gameId, gender: "BOYS" });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to register participant"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/participants/${id}`),
    onSuccess: () => {
      toast.success("Participant removed");
      refetchParticipants();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to remove participant"),
  });

  function confirmDelete(p: ParticipantRow) {
    if (window.confirm(`Remove ${p.firstName} ${p.lastName} (bib ${p.bibNumber})?`)) {
      deleteMutation.mutate(p.id);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-3">
          <CardTitle className="shrink-0">Participants</CardTitle>
          <Select value={gameId} onValueChange={setGameId}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Select a game" />
            </SelectTrigger>
            <SelectContent>
              {(gamesData?.games ?? []).map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={!gameId}>
              <UserPlus className="h-4 w-4" /> Register
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register participant</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="firstName">First name</Label>
                  <Input id="firstName" className="mt-1.5" {...register("firstName")} />
                  {errors.firstName && <p className="mt-1 text-sm text-red-400">{errors.firstName.message}</p>}
                </div>
                <div>
                  <Label htmlFor="lastName">Last name</Label>
                  <Input id="lastName" className="mt-1.5" {...register("lastName")} />
                  {errors.lastName && <p className="mt-1 text-sm text-red-400">{errors.lastName.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Gender</Label>
                  <Select value={watch("gender")} onValueChange={(v) => setValue("gender", v as ParticipantCreateInput["gender"])}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BOYS">Boys</SelectItem>
                      <SelectItem value="GIRLS">Girls</SelectItem>
                      <SelectItem value="MIXED">Mixed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {isOpenTournament ? (
                  <div>
                    <Label>Organization</Label>
                    <Select value={watch("tournamentTeamId") ?? ""} onValueChange={(v) => setValue("tournamentTeamId", v)}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select organization" /></SelectTrigger>
                      <SelectContent>
                        {teams.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {teams.length === 0 && (
                      <p className="mt-1 text-xs text-muted">No organizations registered yet - add one in the Registered Teams tab first.</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <Label>School</Label>
                    <Select value={watch("schoolId") ?? ""} onValueChange={(v) => setValue("schoolId", v)}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select school" /></SelectTrigger>
                      <SelectContent>
                        {schools.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {schools.length === 0 && (
                      <p className="mt-1 text-xs text-muted">No participating schools yet - allocate a bib range in the Bib Ranges tab first.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="bibNumber">
                    Bib number {isOpenTournament ? "(optional - auto-assigned)" : "(optional - auto-assigned from school range)"}
                  </Label>
                  <Input
                    id="bibNumber"
                    type="number"
                    className="mt-1.5"
                    {...register("bibNumber", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
                  />
                </div>
                <div>
                  <Label htmlFor="personalBest">Personal best (e.g. 12.06 or 1:23.45)</Label>
                  <Input id="personalBest" className="mt-1.5" {...register("personalBest")} />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Registering..." : "Register participant"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {!gameId && <p className="text-muted">Select a game to view its participants.</p>}
        {gameId && isLoading && <p className="text-muted">Loading participants...</p>}
        {gameId && !isLoading && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bib</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Institution</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(participantsData?.participants ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.bibNumber}</TableCell>
                  <TableCell>{p.firstName} {p.lastName}</TableCell>
                  <TableCell>{p.school?.name ?? p.tournamentTeam?.name ?? "-"}</TableCell>
                  <TableCell>{p.gender}</TableCell>
                  <TableCell>{p.status.replace(/_/g, " ")}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => setEditingParticipant(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => confirmDelete(p)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(participantsData?.participants ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted">No participants registered yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {editingParticipant && (
        <EditParticipantDialog
          participant={editingParticipant}
          onClose={() => setEditingParticipant(null)}
          onSaved={refetchParticipants}
        />
      )}
    </Card>
  );
}
