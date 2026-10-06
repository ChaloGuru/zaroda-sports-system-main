"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Plus, Trash2, FileDown, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PrintButton } from "@/components/ui/print-button";
import { apiGet, apiPost, apiDelete } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { downloadTeamRosterPdf } from "@/lib/export-team-roster-pdf";
import { LearnerPhoto, PhotoPicker, learnerPhotoDataUrl, uploadLearnerPhoto, type LearnerIdentity } from "@/components/dashboard/learner-photo";
import { EditLearnerDialog, type LearnerRow } from "@/components/dashboard/learners-panel";

interface RosterPlayer {
  id: string;
  firstName: string;
  lastName: string;
  gender: string;
  bibNumber: number;
  jerseyNumber: number | null;
  playingPosition: string | null;
  learner?: LearnerIdentity | null;
}

const EMPTY_NEW = { firstName: "", lastName: "", gender: "", dateOfBirth: "", birthCertNumber: "" };

/**
 * A team's players. A school team's players are that school's learners -
 * picked from those already registered or registered here with their photo,
 * date of birth and birth certificate number - so the same identity checks,
 * age limits and registration deadline apply as for athletes. Open-tournament
 * teams just list names.
 */
export function TeamRosterDialog({
  championshipId,
  championshipName,
  teamId,
  teamName,
  gameId,
  gender,
  schoolId,
}: {
  championshipId: string;
  championshipName: string;
  teamId: string;
  teamName: string;
  gameId: string;
  gender: string;
  /** The school the team represents - null for open-tournament teams. */
  schoolId?: string | null;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [shirt, setShirt] = React.useState({ jerseyNumber: "", playingPosition: "" });
  const [mode, setMode] = React.useState<"existing" | "new">("existing");
  const [learnerId, setLearnerId] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [newLearner, setNewLearner] = React.useState(EMPTY_NEW);
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [editing, setEditing] = React.useState<RosterPlayer | null>(null);
  const isSchoolTeam = !!schoolId;

  const { data, isLoading } = useQuery({
    queryKey: ["team-roster", teamId],
    queryFn: () => apiGet<{ participants: RosterPlayer[] }>(`/api/participants?tournamentTeamId=${teamId}`),
    enabled: open,
  });
  const players = data?.participants ?? [];

  const { data: learnersData } = useQuery({
    queryKey: ["learners", championshipId, schoolId],
    queryFn: () => apiGet<{ learners: LearnerRow[] }>(`/api/learners?championshipId=${championshipId}&schoolId=${schoolId}`),
    enabled: open && isSchoolTeam,
  });
  const candidates = (learnersData?.learners ?? [])
    .filter((l) => !l.participants.some((p) => p.gameId === gameId))
    .filter((l) => gender === "MIXED" || l.gender === gender)
    .filter((l) => !search || `${l.firstName} ${l.lastName} ${l.bibNumber} ${l.birthCertNumber ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["team-roster", teamId] });
    queryClient.invalidateQueries({ queryKey: ["learners", championshipId] });
  }

  const shirtFields = {
    jerseyNumber: shirt.jerseyNumber ? Number(shirt.jerseyNumber) : undefined,
    playingPosition: shirt.playingPosition || undefined,
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      if (isSchoolTeam && mode === "existing") {
        return apiPost("/api/participants", { championshipId, gameId, tournamentTeamId: teamId, learnerId, ...shirtFields });
      }
      const { participant } = await apiPost<{ participant: { learnerId: string | null } }>("/api/participants", {
        championshipId,
        gameId,
        tournamentTeamId: teamId,
        firstName: newLearner.firstName,
        lastName: newLearner.lastName,
        gender: isSchoolTeam && gender === "MIXED" ? newLearner.gender : gender,
        ...(isSchoolTeam
          ? { dateOfBirth: newLearner.dateOfBirth || null, birthCertNumber: newLearner.birthCertNumber.trim() || null }
          : {}),
        ...shirtFields,
      });
      if (photo && participant.learnerId) {
        try {
          await uploadLearnerPhoto(participant.learnerId, photo);
        } catch (error) {
          toast.error(`Player added, but the photo didn't upload: ${error instanceof Error ? error.message : "try again from Edit"}`);
        }
      }
    },
    onSuccess: () => {
      toast.success("Player added");
      setShirt({ jerseyNumber: "", playingPosition: "" });
      setLearnerId("");
      setNewLearner(EMPTY_NEW);
      setPhoto(null);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to add player"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/participants/${id}`),
    onSuccess: () => {
      toast.success("Player removed");
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to remove player"),
  });

  async function download() {
    setDownloading(true);
    try {
      const rows = await Promise.all(
        players.map(async (p) => ({
          ...p,
          dateOfBirth: p.learner?.dateOfBirth ?? null,
          photo: p.learner ? await learnerPhotoDataUrl(p.learner.id, p.learner.photoUpdatedAt) : null,
        })),
      );
      await downloadTeamRosterPdf(championshipName, teamName, rows, isSchoolTeam);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download roster");
    } finally {
      setDownloading(false);
    }
  }

  const needsGender = isSchoolTeam && gender === "MIXED";
  const canAdd =
    isSchoolTeam && mode === "existing"
      ? !!learnerId
      : !!newLearner.firstName && !!newLearner.lastName && (!needsGender || !!newLearner.gender);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Roster">
          <Users className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
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
          <div className="no-print space-y-3 rounded-md border border-border p-3">
            {isSchoolTeam && (
              <div className="grid grid-cols-2 gap-1 rounded-md bg-secondary p-1 text-sm">
                {(
                  [
                    ["existing", "Registered learner"],
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

            {isSchoolTeam && mode === "existing" ? (
              <div className="space-y-2">
                <Input placeholder="Search name, bib or birth cert. no..." value={search} onChange={(e) => setSearch(e.target.value)} />
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {candidates.length === 0 && (
                    <p className="text-sm text-muted">No other learners from this school yet - register a new learner instead.</p>
                  )}
                  {candidates.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setLearnerId(l.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md border p-2 text-left text-sm",
                        learnerId === l.id ? "border-primary bg-secondary" : "border-border hover:bg-secondary/50",
                      )}
                    >
                      <LearnerPhoto learnerId={l.id} photoUpdatedAt={l.photoUpdatedAt} name={`${l.firstName} ${l.lastName}`} className="h-8 w-8" />
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
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="roster-first">First name</Label>
                    <Input
                      id="roster-first"
                      className="mt-1.5"
                      value={newLearner.firstName}
                      onChange={(e) => setNewLearner({ ...newLearner, firstName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="roster-last">Last name</Label>
                    <Input
                      id="roster-last"
                      className="mt-1.5"
                      value={newLearner.lastName}
                      onChange={(e) => setNewLearner({ ...newLearner, lastName: e.target.value })}
                    />
                  </div>
                </div>
                {isSchoolTeam && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="roster-dob">Date of birth</Label>
                        <Input
                          id="roster-dob"
                          type="date"
                          className="mt-1.5"
                          value={newLearner.dateOfBirth}
                          onChange={(e) => setNewLearner({ ...newLearner, dateOfBirth: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="roster-cert">Birth cert. entry no.</Label>
                        <Input
                          id="roster-cert"
                          className="mt-1.5"
                          value={newLearner.birthCertNumber}
                          onChange={(e) => setNewLearner({ ...newLearner, birthCertNumber: e.target.value })}
                        />
                      </div>
                    </div>
                    {needsGender && (
                      <div>
                        <Label>Gender</Label>
                        <Select value={newLearner.gender} onValueChange={(v) => setNewLearner({ ...newLearner, gender: v })}>
                          <SelectTrigger className="mt-1.5"><SelectValue placeholder="Boy or girl" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="BOYS">Boy</SelectItem>
                            <SelectItem value="GIRLS">Girl</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div>
                      <Label>Photo</Label>
                      <div className="mt-1.5">
                        <PhotoPicker file={photo} onChange={setPhoto} />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="grid grid-cols-[100px_1fr_auto] items-end gap-2">
              <div>
                <Label htmlFor="roster-jersey">Shirt #</Label>
                <Input
                  id="roster-jersey"
                  type="number"
                  className="mt-1.5"
                  value={shirt.jerseyNumber}
                  onChange={(e) => setShirt({ ...shirt, jerseyNumber: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="roster-position">Position (optional)</Label>
                <Input
                  id="roster-position"
                  className="mt-1.5"
                  placeholder="e.g. Striker"
                  value={shirt.playingPosition}
                  onChange={(e) => setShirt({ ...shirt, playingPosition: e.target.value })}
                />
              </div>
              <Button disabled={!canAdd || addMutation.isPending} onClick={() => addMutation.mutate()}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
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
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {p.learner && (
                          <LearnerPhoto learnerId={p.learner.id} photoUpdatedAt={p.learner.photoUpdatedAt} name={`${p.firstName} ${p.lastName}`} className="h-8 w-8" />
                        )}
                        {p.firstName} {p.lastName}
                      </div>
                    </TableCell>
                    <TableCell>{p.playingPosition ?? "-"}</TableCell>
                    <TableCell className="no-print text-right">
                      {p.learner && (
                        <Button size="icon" variant="ghost" onClick={() => setEditing(p)} aria-label="Edit learner">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(p.id)} aria-label="Remove player">
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

        {editing?.learner && (
          <EditLearnerDialog
            learner={{
              ...editing.learner,
              schoolId: schoolId ?? null,
              firstName: editing.firstName,
              lastName: editing.lastName,
              gender: editing.gender,
              bibNumber: editing.bibNumber,
            }}
            onClose={() => setEditing(null)}
            onSaved={refresh}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
