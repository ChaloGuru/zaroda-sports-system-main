"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileDown, Merge, Pencil, Printer, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { useChampionshipSchools } from "@/components/dashboard/schools-panel";
import { LearnerPhoto, PhotoPicker, ageFrom, uploadLearnerPhoto } from "@/components/dashboard/learner-photo";
import type { NominalRollSchool } from "@/lib/export-nominal-roll-pdf";

export interface LearnerRow {
  id: string;
  schoolId: string | null;
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string | null;
  birthCertNumber: string | null;
  bibNumber: number;
  photoUpdatedAt: string | null;
  school?: { name: string } | null;
  participants: { gameId: string; game: { name: string } }[];
}

const ALL = "all";

/** Edits who a learner is - every event they're entered in follows. */
export function EditLearnerDialog({ learner, onClose, onSaved }: { learner: LearnerRow; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = React.useState({
    firstName: learner.firstName,
    lastName: learner.lastName,
    gender: learner.gender,
    bibNumber: String(learner.bibNumber),
    dateOfBirth: learner.dateOfBirth?.slice(0, 10) ?? "",
    birthCertNumber: learner.birthCertNumber ?? "",
  });
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [saving, setSaving] = React.useState(false);
  const events = learner.participants.length;

  async function save() {
    setSaving(true);
    try {
      await apiPatch(`/api/learners/${learner.id}`, {
        firstName: form.firstName,
        lastName: form.lastName,
        gender: form.gender,
        bibNumber: Number(form.bibNumber),
        dateOfBirth: form.dateOfBirth || null,
        birthCertNumber: form.birthCertNumber.trim() || null,
      });
      if (photo) await uploadLearnerPhoto(learner.id, photo);
      toast.success("Learner updated");
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update learner");
    } finally {
      setSaving(false);
    }
  }

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit learner</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {events > 1 && <p className="text-sm text-muted">Entered in {events} events - changes apply to all of them.</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="learner-firstName">First name</Label>
              <Input id="learner-firstName" className="mt-1.5" {...field("firstName")} />
            </div>
            <div>
              <Label htmlFor="learner-lastName">Last name</Label>
              <Input id="learner-lastName" className="mt-1.5" {...field("lastName")} />
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
              <Label htmlFor="learner-bib">Bib number</Label>
              <Input id="learner-bib" type="number" className="mt-1.5" {...field("bibNumber")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="learner-dob">Date of birth</Label>
              <Input id="learner-dob" type="date" className="mt-1.5" {...field("dateOfBirth")} />
            </div>
            <div>
              <Label htmlFor="learner-birth-cert">Birth cert. entry no.</Label>
              <Input id="learner-birth-cert" className="mt-1.5" {...field("birthCertNumber")} />
            </div>
          </div>
          <div>
            <Label>Photo</Label>
            <div className="mt-1.5">
              <PhotoPicker
                file={photo}
                onChange={setPhoto}
                current={{ learnerId: learner.id, photoUpdatedAt: learner.photoUpdatedAt, name: `${learner.firstName} ${learner.lastName}` }}
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

/** Picks which of two records of one learner to keep, then merges them. */
function MergeDialog({ learners, onClose, onMerged }: { learners: [LearnerRow, LearnerRow]; onClose: () => void; onMerged: () => void }) {
  const [keepId, setKeepId] = React.useState(learners[0].id);
  const keep = learners.find((l) => l.id === keepId)!;
  const duplicate = learners.find((l) => l.id !== keepId)!;

  const merge = useMutation({
    mutationFn: () => apiPost("/api/learners/merge", { keepLearnerId: keep.id, duplicateLearnerId: duplicate.id }),
    onSuccess: () => {
      toast.success(`Merged - ${keep.firstName} ${keep.lastName} now has one bib (${keep.bibNumber}) in all events`);
      onMerged();
      onClose();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Merge failed"),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge into one learner</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted">
          Pick the record to keep. The other one&apos;s events move to it under the kept bib, any date of birth, birth
          certificate number or photo only the other one has is copied over, and the other record is deleted.
        </p>
        <div className="space-y-2">
          {learners.map((l) => (
            <label
              key={l.id}
              className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm ${keepId === l.id ? "border-primary bg-secondary" : "border-border"}`}
            >
              <input type="radio" name="keep" checked={keepId === l.id} onChange={() => setKeepId(l.id)} />
              <LearnerPhoto learnerId={l.id} photoUpdatedAt={l.photoUpdatedAt} name={`${l.firstName} ${l.lastName}`} className="h-12 w-12" />
              <span className="flex-1">
                <span className="font-medium text-foreground">
                  {l.firstName} {l.lastName} - bib {l.bibNumber}
                </span>
                <span className="block text-xs text-muted">
                  {l.dateOfBirth ? `Born ${formatDate(l.dateOfBirth)}` : "No date of birth"} · Birth cert. {l.birthCertNumber ?? "-"}
                </span>
                <span className="block text-xs text-muted">{l.participants.map((p) => p.game.name).join(", ") || "No events"}</span>
              </span>
              {keepId === l.id && <Badge variant="success">Keep</Badge>}
            </label>
          ))}
        </div>
        <Button className="w-full" disabled={merge.isPending} onClick={() => merge.mutate()}>
          <Merge className="h-4 w-4" /> {merge.isPending ? "Merging..." : `Keep bib ${keep.bibNumber} and merge`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

type LearnerGroup = [LearnerRow, LearnerRow, ...LearnerRow[]];

/** Same school and the same name (ignoring case and spacing) - probably one learner registered twice. */
function findDuplicateGroups(learners: LearnerRow[]): LearnerGroup[] {
  const groups = new Map<string, LearnerRow[]>();
  for (const l of learners) {
    const key = `${l.schoolId}|${`${l.firstName} ${l.lastName}`.toLowerCase().replace(/\s+/g, " ").trim()}`;
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  return Array.from(groups.values()).filter((g): g is LearnerGroup => g.length > 1);
}

async function photoDataUrl(learner: LearnerRow): Promise<string | null> {
  if (!learner.photoUpdatedAt) return null;
  try {
    const res = await fetch(`/api/learners/${learner.id}/photo?v=${encodeURIComponent(learner.photoUpdatedAt)}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * A championship's registered learners by school - who each is (photo, date
 * of birth, birth certificate number), the events they're in, merging a
 * learner registered twice, and each school's nominal roll for the head
 * teacher to sign.
 */
export function LearnersPanel({ championshipId, championshipName }: { championshipId: string; championshipName: string }) {
  const queryClient = useQueryClient();
  const [schoolId, setSchoolId] = React.useState(ALL);
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [editing, setEditing] = React.useState<LearnerRow | null>(null);
  const [merging, setMerging] = React.useState<[LearnerRow, LearnerRow] | null>(null);
  const [exporting, setExporting] = React.useState<"download" | "print" | null>(null);

  const { data: schoolsData } = useChampionshipSchools(championshipId);
  const schools = schoolsData?.schools ?? [];
  const { data, isLoading } = useQuery({
    queryKey: ["learners", championshipId, ALL],
    queryFn: () => apiGet<{ learners: LearnerRow[] }>(`/api/learners?championshipId=${championshipId}`),
  });
  const all = data?.learners ?? [];
  const inSchool = schoolId === ALL ? all : all.filter((l) => l.schoolId === schoolId);
  const shown = inSchool.filter(
    (l) => !search || `${l.firstName} ${l.lastName} ${l.bibNumber} ${l.birthCertNumber ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );
  const duplicateGroups = findDuplicateGroups(inSchool);
  const schoolName = (id: string | null) => schools.find((s) => s.schoolId === id)?.label ?? all.find((l) => l.schoolId === id)?.school?.name ?? "No school";

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["learners", championshipId] });
    queryClient.invalidateQueries({ queryKey: ["participants"] });
    queryClient.invalidateQueries({ queryKey: ["call-room-participants"] });
    setSelected([]);
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-2)));
  }

  async function nominalRoll(action: "download" | "print") {
    setExporting(action);
    try {
      const bySchool = new Map<string, LearnerRow[]>();
      for (const l of inSchool) bySchool.set(l.schoolId ?? "", [...(bySchool.get(l.schoolId ?? "") ?? []), l]);
      const rolls: NominalRollSchool[] = [];
      for (const [id, learners] of Array.from(bySchool.entries()).sort((a, b) => schoolName(a[0]).localeCompare(schoolName(b[0])))) {
        rolls.push({
          schoolName: schoolName(id || null),
          learners: await Promise.all(
            learners.map(async (l) => ({
              bibNumber: l.bibNumber,
              name: `${l.firstName} ${l.lastName}`,
              gender: l.gender === "BOYS" ? "Boy" : l.gender === "GIRLS" ? "Girl" : "Mixed",
              dateOfBirth: l.dateOfBirth,
              birthCertNumber: l.birthCertNumber,
              events: l.participants.map((p) => p.game.name),
              photo: await photoDataUrl(l),
            })),
          ),
        });
      }
      if (rolls.length === 0) {
        toast.error("No learners to put on a nominal roll yet");
        return;
      }
      const { buildNominalRollDoc } = await import("@/lib/export-nominal-roll-pdf");
      const doc = await buildNominalRollDoc(championshipName, rolls);
      const slug = (schoolId === ALL ? "all-schools" : schoolName(schoolId)).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      if (action === "download") {
        doc.save(`nominal-roll-${slug}.pdf`);
      } else {
        doc.autoPrint();
        window.open(doc.output("bloburl"), "_blank");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't build the nominal roll");
    } finally {
      setExporting(null);
    }
  }

  const selectedLearners = selected.map((id) => all.find((l) => l.id === id)).filter((l): l is LearnerRow => !!l);
  const selectedPair = selectedLearners.length === 2 ? (selectedLearners as [LearnerRow, LearnerRow]) : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-4">
          <div>
            <CardTitle>Learners</CardTitle>
            <CardDescription>
              Each learner is registered once, with one bib for all their events. Print a school&apos;s nominal roll for
              the head teacher to sign and stamp, and keep it with the call room.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={schoolId}
              onValueChange={(v) => {
                setSchoolId(v);
                setSelected([]);
              }}
            >
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All schools</SelectItem>
                {schools.map((s) => (
                  <SelectItem key={s.schoolId} value={s.schoolId}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input placeholder="Search name, bib or birth cert. no..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-64 pl-9" />
            </div>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Button size="sm" variant="outline" disabled={!!exporting} onClick={() => nominalRoll("download")}>
                <FileDown className="h-4 w-4" /> {exporting === "download" ? "Building..." : "Nominal roll PDF"}
              </Button>
              <Button size="sm" variant="outline" disabled={!!exporting} onClick={() => nominalRoll("print")}>
                <Printer className="h-4 w-4" /> {exporting === "print" ? "Building..." : "Print"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {duplicateGroups.length > 0 && (
            <div className="space-y-2 rounded-md border border-[#F0B429]/60 bg-[#F0B429]/10 p-4">
              <p className="text-sm font-medium text-foreground">
                Possible duplicates - the same name registered more than once at a school. If it&apos;s one learner, merge
                them so they have one bib.
              </p>
              {duplicateGroups.map((group) => (
                <div key={group[0].id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-foreground">
                    {group[0].firstName} {group[0].lastName} ({schoolName(group[0].schoolId)}) - bibs {group.map((l) => l.bibNumber).join(", ")}
                  </span>
                  {group.length === 2 && (
                    <Button size="sm" variant="secondary" onClick={() => setMerging([group[0], group[1]])}>
                      <Merge className="h-4 w-4" /> Review &amp; merge
                    </Button>
                  )}
                  {group.length > 2 && <span className="text-xs text-muted">Tick two of them below to merge a pair at a time.</span>}
                </div>
              ))}
            </div>
          )}

          {selected.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">{selected.length} selected</span>
              <Button size="sm" disabled={!selectedPair} onClick={() => selectedPair && setMerging(selectedPair)}>
                <Merge className="h-4 w-4" /> Merge the two selected
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button>
            </div>
          )}

          {isLoading && <p className="text-muted">Loading learners...</p>}
          {!isLoading && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Learner</TableHead>
                  <TableHead>Bib</TableHead>
                  {schoolId === ALL && <TableHead>School</TableHead>}
                  <TableHead>Date of birth</TableHead>
                  <TableHead>Birth cert. no.</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead className="text-right">Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <input type="checkbox" aria-label={`Select ${l.firstName} ${l.lastName}`} checked={selected.includes(l.id)} onChange={() => toggle(l.id)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <LearnerPhoto learnerId={l.id} photoUpdatedAt={l.photoUpdatedAt} name={`${l.firstName} ${l.lastName}`} />
                        <span>
                          {l.firstName} {l.lastName}
                          <span className="block text-xs text-muted">{l.gender === "BOYS" ? "Boy" : l.gender === "GIRLS" ? "Girl" : "Mixed"}</span>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{l.bibNumber}</TableCell>
                    {schoolId === ALL && <TableCell>{schoolName(l.schoolId)}</TableCell>}
                    <TableCell>{l.dateOfBirth ? `${formatDate(l.dateOfBirth)} (${ageFrom(l.dateOfBirth)})` : <span className="text-muted">-</span>}</TableCell>
                    <TableCell>{l.birthCertNumber ?? <span className="text-muted">-</span>}</TableCell>
                    <TableCell className="text-sm">{l.participants.map((p) => p.game.name).join(", ") || <span className="text-muted">None</span>}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => setEditing(l)} aria-label="Edit learner">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {shown.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted">
                      No learners yet - register them in the Participants tab.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {editing && <EditLearnerDialog learner={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      {merging && <MergeDialog learners={merging} onClose={() => setMerging(null)} onMerged={refresh} />}
    </div>
  );
}
