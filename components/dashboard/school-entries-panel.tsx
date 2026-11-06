"use client";

import * as React from "react";
import { useQueries, useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiDelete, apiGet, apiPost } from "@/lib/api-client";
import { MAX_LEARNERS_PER_SCHOOL } from "@/lib/validations";
import { LearnerPhoto, PhotoPicker, idSearchText, registerLearnerWithPhoto } from "@/components/dashboard/learner-photo";
import { EditLearnerDialog, type LearnerRow } from "@/components/dashboard/learners-panel";

interface SchoolEntry {
  schoolId: string;
  name: string;
  label: string;
  schoolLevel: string | null;
}

interface RaceOption {
  id: string;
  name: string;
  category: string;
  gender: string;
  schoolLevel: string;
}

const EMPTY_FORM = { firstName: "", lastName: "", gender: "", dateOfBirth: "", birthCertNumber: "", knecAssessmentNumber: "", kemisUpi: "" };

/**
 * One school's learners. A school account registers them ahead of the day; a
 * team manager the admin signed up can also assign them to races, and forms
 * ball-game lists on each team's roster. The API enforces the deadline, the
 * locks and the learner limit.
 */
export function SchoolEntriesPanel({
  championshipId,
  schoolName,
  assignRaces = true,
}: {
  championshipId: string;
  schoolName: string;
  assignRaces?: boolean;
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = React.useState("");
  const [gameId, setGameId] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [personalBests, setPersonalBests] = React.useState<Record<string, string>>({});
  const [editing, setEditing] = React.useState<LearnerRow | null>(null);

  const { data: schoolsData } = useQuery({
    queryKey: ["championship-schools", championshipId],
    queryFn: () => apiGet<{ schools: SchoolEntry[] }>(`/api/championship-schools?championshipId=${championshipId}`),
  });
  const entries = (schoolsData?.schools ?? []).filter((s) => s.name.trim().toLowerCase() === schoolName.trim().toLowerCase());
  // A split school picks Primary or JS for each learner: the age limit depends on it.
  const entry = entries.length === 1 ? entries[0] : entries.find((s) => s.schoolId === selectedId);

  // A Primary/JS school has two entries, and both count towards its limit.
  const learnerQueries = useQueries({
    queries: entries.map((s) => ({
      queryKey: ["learners", championshipId, s.schoolId],
      queryFn: () => apiGet<{ learners: LearnerRow[] }>(`/api/learners?championshipId=${championshipId}&schoolId=${s.schoolId}`),
    })),
  });
  const registered = learnerQueries.reduce((total, q) => total + (q.data?.learners.length ?? 0), 0);
  const learners = learnerQueries[entries.indexOf(entry as SchoolEntry)]?.data?.learners ?? [];

  const { data: gamesData } = useQuery({
    queryKey: ["games", championshipId],
    queryFn: () => apiGet<{ games: RaceOption[] }>(`/api/games?championshipId=${championshipId}`),
  });
  const races = (gamesData?.games ?? []).filter(
    (g) => g.category === "ATHLETICS" && (!entry?.schoolLevel || g.schoolLevel === entry.schoolLevel),
  );
  const race = races.find((g) => g.id === gameId);

  const entered = race ? learners.filter((l) => l.participants.some((p) => p.gameId === race.id)) : [];
  const available = race
    ? learners
        .filter((l) => !l.participants.some((p) => p.gameId === race.id))
        .filter((l) => race.gender === "MIXED" || l.gender === race.gender)
        .filter((l) => !search || `${l.firstName} ${l.lastName} ${l.bibNumber} ${idSearchText(l)}`.toLowerCase().includes(search.toLowerCase()))
    : [];

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["learners", championshipId] });
    queryClient.invalidateQueries({ queryKey: ["participants"] });
  }

  const showError = (fallback: string) => (error: unknown) => toast.error(error instanceof Error ? error.message : fallback);

  const registerLearner = useMutation({
    mutationFn: () =>
      registerLearnerWithPhoto(
        { ...form, championshipId, schoolId: entry?.schoolId, dateOfBirth: form.dateOfBirth || null },
        photo as File,
      ),
    onSuccess: () => {
      toast.success("Learner registered");
      setForm(EMPTY_FORM);
      setPhoto(null);
      refresh();
    },
    onError: (error) => {
      showError("Failed to register learner")(error);
      refresh();
    },
  });

  const enter = useMutation({
    mutationFn: (learnerId: string) =>
      apiPost("/api/participants", { championshipId, gameId, learnerId, personalBest: personalBests[learnerId]?.trim() || null }),
    onSuccess: (_data, learnerId) => {
      toast.success("Learner entered");
      setPersonalBests(({ [learnerId]: _entered, ...others }) => others);
      refresh();
    },
    onError: showError("Failed to enter learner"),
  });

  const remove = useMutation({
    mutationFn: (participantId: string) => apiDelete(`/api/participants/${participantId}`),
    onSuccess: () => {
      toast.success("Learner removed from this race");
      refresh();
    },
    onError: showError("Failed to remove learner"),
  });

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted">{schoolName} isn&apos;t on this championship&apos;s school list yet - ask the tournament admin to add it.</CardContent>
      </Card>
    );
  }

  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });
  const canRegister = !!form.firstName.trim() && !!form.lastName.trim() && !!form.gender && !!entry && !!photo;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Register learners</CardTitle>
          <p className="text-sm text-muted">
            {registered} of {MAX_LEARNERS_PER_SCHOOL} registered
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {entries.length > 1 && (
            <div>
              <Label>Level (sets the age limit)</Label>
              <Select value={entry?.schoolId} onValueChange={(v) => { setSelectedId(v); setGameId(""); }}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Primary or JS" /></SelectTrigger>
                <SelectContent>
                  {entries.map((s) => <SelectItem key={s.schoolId} value={s.schoolId}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="school-first-name">First name</Label>
              <Input id="school-first-name" className="mt-1.5" value={form.firstName} onChange={set("firstName")} />
            </div>
            <div>
              <Label htmlFor="school-last-name">Last name</Label>
              <Input id="school-last-name" className="mt-1.5" value={form.lastName} onChange={set("lastName")} />
            </div>
            <div>
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Boy or girl" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOYS">Boy</SelectItem>
                  <SelectItem value="GIRLS">Girl</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="school-dob">Date of birth</Label>
              <Input id="school-dob" type="date" className="mt-1.5" value={form.dateOfBirth} onChange={set("dateOfBirth")} />
            </div>
            <div>
              <Label htmlFor="school-birth-cert">Birth certificate entry no.</Label>
              <Input id="school-birth-cert" className="mt-1.5" value={form.birthCertNumber} onChange={set("birthCertNumber")} />
            </div>
            <div>
              <Label htmlFor="school-knec">KNEC assessment no.</Label>
              <Input id="school-knec" className="mt-1.5" value={form.knecAssessmentNumber} onChange={set("knecAssessmentNumber")} />
            </div>
            <div>
              <Label htmlFor="school-kemis">KEMIS UPI</Label>
              <Input id="school-kemis" className="mt-1.5" value={form.kemisUpi} onChange={set("kemisUpi")} />
            </div>
          </div>
          <div>
            <Label>Photo (required)</Label>
            <div className="mt-1.5"><PhotoPicker file={photo} onChange={setPhoto} /></div>
          </div>
          <Button disabled={!canRegister || registerLearner.isPending} onClick={() => registerLearner.mutate()}>
            <UserPlus className="h-4 w-4" /> Register learner
          </Button>
        </CardContent>
      </Card>

      {!assignRaces && learners.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Registered learners</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {learners.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
                <span className="flex items-center gap-2">
                  <LearnerPhoto learnerId={l.id} photoUpdatedAt={l.photoUpdatedAt} name={`${l.firstName} ${l.lastName}`} />
                  {l.firstName} {l.lastName} - bib {l.bibNumber}
                </span>
                {!l.photoUpdatedAt && <Button size="sm" variant="outline" onClick={() => setEditing(l)}>Add photo</Button>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {assignRaces && races.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Assign learners to races</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={gameId} onValueChange={setGameId}>
              <SelectTrigger><SelectValue placeholder="Select a race" /></SelectTrigger>
              <SelectContent>
                {races.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>

            {race && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Registered learners</p>
                  <Input placeholder="Search name, bib or ID no..." value={search} onChange={(e) => setSearch(e.target.value)} />
                  {available.map((l) => (
                    <div key={l.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
                      <span className="flex items-center gap-2">
                        <LearnerPhoto learnerId={l.id} photoUpdatedAt={l.photoUpdatedAt} name={`${l.firstName} ${l.lastName}`} />
                        {l.firstName} {l.lastName} - bib {l.bibNumber}
                      </span>
                      {l.photoUpdatedAt ? (
                        <span className="flex items-center gap-2">
                          <Input
                            className="w-24"
                            placeholder="PB 12.06"
                            aria-label={`Personal best for ${l.firstName} ${l.lastName}`}
                            value={personalBests[l.id] ?? ""}
                            onChange={(e) => setPersonalBests({ ...personalBests, [l.id]: e.target.value })}
                          />
                          <Button size="sm" variant="outline" disabled={enter.isPending} onClick={() => enter.mutate(l.id)}>
                            <Plus className="h-4 w-4" /> Enter
                          </Button>
                        </span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setEditing(l)}>Add photo</Button>
                      )}
                    </div>
                  ))}
                  {available.length === 0 && <p className="text-sm text-muted">No more learners to enter.</p>}
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Entered in {race.name} ({entered.length})</p>
                  {entered.map((l) => {
                    const entry = l.participants.find((p) => p.gameId === race.id);
                    return (
                      <div key={l.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
                        <span>{l.firstName} {l.lastName} - bib {l.bibNumber}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={remove.isPending || !entry?.id}
                          onClick={() => entry?.id && remove.mutate(entry.id)}
                          aria-label={`Remove ${l.firstName} ${l.lastName}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                  {entered.length === 0 && <p className="text-sm text-muted">Nobody entered yet.</p>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {editing && <EditLearnerDialog learner={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  );
}
