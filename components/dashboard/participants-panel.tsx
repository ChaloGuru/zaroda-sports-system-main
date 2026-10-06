"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { UserPlus, Pencil, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { learnerEntryCreateSchema, type LearnerEntryCreateInput } from "@/lib/validations";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { useCanManageGame } from "@/hooks/use-game-access";
import { useChampionshipSchools } from "@/components/dashboard/schools-panel";
import { LearnerPhoto, PhotoPicker, uploadLearnerPhoto, type LearnerIdentity } from "@/components/dashboard/learner-photo";
import { cn } from "@/lib/utils";
import type { Role } from "@prisma/client";

// Only the school-ladder registration path (no tournamentTeamId) goes
// through requireGameAccess with these roles - open-tournament team
// registration is authorized separately via requireTeamAccess, unrelated to
// sport/discipline scope (see app/api/participants/route.ts).
const PARTICIPANT_ROLES: Role[] = ["TOURNAMENT_ADMIN", "SCOREKEEPER"];

interface GameOption {
  id: string;
  name: string;
  category: string;
  sport: string | null;
  isTimed: boolean;
  schoolLevel: string;
  gender: string;
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
  learner?: LearnerIdentity | null;
}

interface LearnerOption {
  id: string;
  firstName: string;
  lastName: string;
  gender: string;
  bibNumber: number;
  upiNumber: string | null;
  photoUpdatedAt: string | null;
  participants: { gameId: string; game: { name: string } }[];
}

interface EditForm {
  firstName: string;
  lastName: string;
  gender: string;
  bibNumber: string;
  dateOfBirth: string;
  upiNumber: string;
}

function GenderSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="BOYS">Boys</SelectItem>
        <SelectItem value="GIRLS">Girls</SelectItem>
        <SelectItem value="MIXED">Mixed</SelectItem>
      </SelectContent>
    </Select>
  );
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
  const learner = participant.learner ?? null;
  const [form, setForm] = React.useState<EditForm>({
    firstName: participant.firstName,
    lastName: participant.lastName,
    gender: participant.gender,
    bibNumber: participant.bibNumber.toString(),
    dateOfBirth: learner?.dateOfBirth?.slice(0, 10) ?? "",
    upiNumber: learner?.upiNumber ?? "",
  });
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [saving, setSaving] = React.useState(false);
  const otherEvents = learner ? learner.participants.length - 1 : 0;

  async function save() {
    setSaving(true);
    try {
      const identity = {
        firstName: form.firstName,
        lastName: form.lastName,
        gender: form.gender,
        bibNumber: Number(form.bibNumber),
      };
      if (learner) {
        // Saved on the learner, so every event they're entered in follows.
        await apiPatch(`/api/learners/${learner.id}`, {
          ...identity,
          dateOfBirth: form.dateOfBirth || null,
          upiNumber: form.upiNumber.trim() || null,
        });
        if (photo) await uploadLearnerPhoto(learner.id, photo);
      } else {
        await apiPatch(`/api/participants/${participant.id}`, identity);
      }
      toast.success(learner ? "Learner updated" : "Participant updated");
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
          <DialogTitle>{learner ? "Edit learner" : "Edit participant"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {learner && otherEvents > 0 && (
            <p className="text-sm text-muted">
              Also entered in {otherEvents} other event{otherEvents === 1 ? "" : "s"} - changes apply to all of them.
            </p>
          )}
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
              <GenderSelect value={form.gender} onChange={(v) => setForm((f) => ({ ...f, gender: v }))} />
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
          {learner && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="edit-dob">Date of birth</Label>
                  <Input
                    id="edit-dob"
                    type="date"
                    className="mt-1.5"
                    value={form.dateOfBirth}
                    onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-upi">UPI number</Label>
                  <Input
                    id="edit-upi"
                    className="mt-1.5"
                    value={form.upiNumber}
                    onChange={(e) => setForm((f) => ({ ...f, upiNumber: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label>Photo</Label>
                <div className="mt-1.5">
                  <PhotoPicker
                    file={photo}
                    onChange={setPhoto}
                    current={{ learnerId: learner.id, photoUpdatedAt: learner.photoUpdatedAt, name: `${participant.firstName} ${participant.lastName}` }}
                  />
                </div>
              </div>
            </>
          )}
          <Button className="w-full" disabled={saving} onClick={save}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Enters a learner the school already registered in this event, with the
 * same bib - common at lower levels, where a small school's learners run
 * several events.
 */
function ExistingLearnerForm({
  championshipId,
  game,
  schools,
  onDone,
}: {
  championshipId: string;
  game: GameOption;
  schools: SchoolOption[];
  onDone: () => void;
}) {
  const [schoolId, setSchoolId] = React.useState("");
  const [learnerId, setLearnerId] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [personalBest, setPersonalBest] = React.useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["learners", championshipId, schoolId],
    queryFn: () => apiGet<{ learners: LearnerOption[] }>(`/api/learners?championshipId=${championshipId}&schoolId=${schoolId}`),
    enabled: !!schoolId,
  });
  const learners = (data?.learners ?? [])
    .filter((l) => !l.participants.some((p) => p.gameId === game.id))
    .filter((l) => game.gender === "MIXED" || l.gender === game.gender)
    .filter((l) => !search || `${l.firstName} ${l.lastName} ${l.bibNumber} ${l.upiNumber ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  const enter = useMutation({
    mutationFn: () => apiPost("/api/participants", { championshipId, gameId: game.id, learnerId, personalBest: personalBest || null }),
    onSuccess: () => {
      toast.success("Learner entered in this event");
      onDone();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to enter learner"),
  });

  return (
    <div className="space-y-4">
      <div>
        <Label>School</Label>
        <Select
          value={schoolId}
          onValueChange={(v) => {
            setSchoolId(v);
            setLearnerId("");
          }}
        >
          <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select school" /></SelectTrigger>
          <SelectContent>
            {schools.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {schoolId && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input placeholder="Search name, bib or UPI..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {isLoading && <p className="text-sm text-muted">Loading learners...</p>}
            {!isLoading && learners.length === 0 && (
              <p className="text-sm text-muted">No learners from this school to add - register a new learner instead.</p>
            )}
            {learners.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLearnerId(l.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md border p-2 text-left text-sm",
                  learnerId === l.id ? "border-primary bg-secondary" : "border-border hover:bg-secondary/50",
                )}
              >
                <LearnerPhoto learnerId={l.id} photoUpdatedAt={l.photoUpdatedAt} name={`${l.firstName} ${l.lastName}`} />
                <span className="flex-1">
                  <span className="font-medium text-foreground">{l.firstName} {l.lastName}</span>
                  <span className="block text-xs text-muted">
                    Bib {l.bibNumber}
                    {l.participants.length > 0 && ` · in ${l.participants.map((p) => p.game.name).join(", ")}`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="existing-pb">Personal best in this event (optional)</Label>
        <Input id="existing-pb" className="mt-1.5" value={personalBest} onChange={(e) => setPersonalBest(e.target.value)} />
      </div>

      <Button className="w-full" disabled={!learnerId || enter.isPending} onClick={() => enter.mutate()}>
        {enter.isPending ? "Adding..." : "Enter in this event"}
      </Button>
    </div>
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
  const [mode, setMode] = React.useState<"existing" | "new">("existing");
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [editingParticipant, setEditingParticipant] = React.useState<ParticipantRow | null>(null);

  const { data: gamesData } = useQuery({
    queryKey: ["games", championshipId],
    queryFn: () => apiGet<{ games: GameOption[] }>(`/api/games?championshipId=${championshipId}`),
  });
  // School-ladder championships: only this championship's own schools (added
  // by its admin in the Schools tab) are selectable.
  const { data: schoolsData } = useChampionshipSchools(championshipId, !isOpenTournament);
  // In a Primary/JS championship each school has a Primary and a JS entry -
  // only offer the entries matching the selected event's level.
  const eventLevel = (gamesData?.games ?? []).find((g) => g.id === gameId)?.schoolLevel;
  const schools: SchoolOption[] = (schoolsData?.schools ?? [])
    .filter((s) => !s.schoolLevel || !eventLevel || s.schoolLevel === eventLevel)
    .map((s) => ({ id: s.schoolId, name: s.label }));
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
    // A learner's details show in every event they're entered in.
    queryClient.invalidateQueries({ queryKey: ["participants"] });
    queryClient.invalidateQueries({ queryKey: ["learners", championshipId] });
    queryClient.invalidateQueries({ queryKey: ["call-room-participants"] });
  }

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<LearnerEntryCreateInput>({
    resolver: zodResolver(learnerEntryCreateSchema),
    defaultValues: { championshipId, gameId, gender: "BOYS" },
  });

  React.useEffect(() => {
    setValue("gameId", gameId);
  }, [gameId, setValue]);

  function closeRegister() {
    setOpen(false);
    setPhoto(null);
    reset({ championshipId, gameId, gender: "BOYS" });
  }

  const createMutation = useMutation({
    mutationFn: async (values: LearnerEntryCreateInput) => {
      const { participant } = await apiPost<{ participant: { learnerId: string | null } }>("/api/participants", values);
      if (photo && participant.learnerId) {
        try {
          await uploadLearnerPhoto(participant.learnerId, photo);
        } catch (error) {
          toast.error(`Registered, but the photo didn't upload: ${error instanceof Error ? error.message : "try again from Edit"}`);
        }
      }
    },
    onSuccess: () => {
      toast.success("Participant registered");
      refetchParticipants();
      closeRegister();
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
    if (window.confirm(`Remove ${p.firstName} ${p.lastName} (bib ${p.bibNumber}) from this event?`)) {
      deleteMutation.mutate(p.id);
    }
  }

  const selectedGame = (gamesData?.games ?? []).find((g) => g.id === gameId);
  // Open-tournament registration is team-scoped (requireTeamAccess), not
  // sport-scoped, so it's exempt from this game-scope gate.
  const gameScopeOk = useCanManageGame(championshipId, PARTICIPANT_ROLES, selectedGame);
  const canManage = isOpenTournament || gameScopeOk;
  const showNewForm = isOpenTournament || mode === "new";

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

        <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : closeRegister())}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={!gameId || !canManage}>
              <UserPlus className="h-4 w-4" /> Register
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Register participant</DialogTitle>
            </DialogHeader>
            {!isOpenTournament && (
              <div className="grid grid-cols-2 gap-1 rounded-md bg-secondary p-1 text-sm">
                {(
                  [
                    ["existing", "Existing learner"],
                    ["new", "New learner"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value)}
                    className={cn("rounded px-3 py-1.5", mode === value ? "bg-surface font-medium text-foreground shadow-sm" : "text-muted")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {!showNewForm && selectedGame && (
              <ExistingLearnerForm
                championshipId={championshipId}
                game={selectedGame}
                schools={schools}
                onDone={() => {
                  refetchParticipants();
                  closeRegister();
                }}
              />
            )}
            {showNewForm && (
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
                    <GenderSelect value={watch("gender")} onChange={(v) => setValue("gender", v as LearnerEntryCreateInput["gender"])} />
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
                        <p className="mt-1 text-xs text-muted">No schools yet - add this championship&apos;s schools in the Schools tab first.</p>
                      )}
                    </div>
                  )}
                </div>

                {!isOpenTournament && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="dateOfBirth">Date of birth</Label>
                      <Input
                        id="dateOfBirth"
                        type="date"
                        className="mt-1.5"
                        {...register("dateOfBirth", { setValueAs: (v) => (v === "" ? null : v) })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="upiNumber">UPI number</Label>
                      <Input id="upiNumber" className="mt-1.5" {...register("upiNumber")} />
                      {errors.upiNumber && <p className="mt-1 text-sm text-red-400">{errors.upiNumber.message}</p>}
                    </div>
                  </div>
                )}

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

                {!isOpenTournament && (
                  <div>
                    <Label>Photo</Label>
                    <div className="mt-1.5">
                      <PhotoPicker file={photo} onChange={setPhoto} />
                    </div>
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Registering..." : "Register participant"}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {!gameId && <p className="text-muted">Select a game to view its participants.</p>}
        {gameId && !canManage && (
          <p className="mb-3 text-sm text-[#B45309]">You don&apos;t have access to manage this sport/discipline.</p>
        )}
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
              {(participantsData?.participants ?? []).map((p) => {
                const otherEvents = (p.learner?.participants ?? []).filter((e) => e.gameId !== gameId);
                return (
                  <TableRow key={p.id}>
                    <TableCell>{p.bibNumber}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {p.learner && (
                          <LearnerPhoto learnerId={p.learner.id} photoUpdatedAt={p.learner.photoUpdatedAt} name={`${p.firstName} ${p.lastName}`} className="h-8 w-8" />
                        )}
                        <div>
                          {p.firstName} {p.lastName}
                          {otherEvents.length > 0 && (
                            <span className="block text-xs text-muted">Also in {otherEvents.map((e) => e.game.name).join(", ")}</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{p.school?.name ?? p.tournamentTeam?.name ?? "-"}</TableCell>
                    <TableCell>{p.gender}</TableCell>
                    <TableCell>{p.status.replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" disabled={!canManage} onClick={() => setEditingParticipant(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" disabled={!canManage} onClick={() => confirmDelete(p)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
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
