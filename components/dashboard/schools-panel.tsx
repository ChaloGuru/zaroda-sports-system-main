"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import type { ChampionshipSchoolRow } from "@/app/api/championship-schools/route";
import { gameSchoolLevelLabel } from "@/lib/school-levels";

/** Shared query key so every school picker (bib ranges, participants, teams, roles) refreshes together. */
export const championshipSchoolsKey = (championshipId: string) => ["championship-schools", championshipId];

export function useChampionshipSchools(championshipId: string, enabled = true) {
  return useQuery({
    queryKey: championshipSchoolsKey(championshipId),
    queryFn: () => apiGet<{ schools: ChampionshipSchoolRow[] }>(`/api/championship-schools?championshipId=${championshipId}`),
    enabled: enabled && !!championshipId,
  });
}

export function SchoolsPanel({
  championshipId,
  championshipCounty,
  championshipSchoolLevel,
}: {
  championshipId: string;
  championshipCounty: string;
  /** Championship.schoolLevel - PRIMARY_JS splits every school into a Primary and a JS entry. */
  championshipSchoolLevel: string;
}) {
  const splitsByLevel = championshipSchoolLevel === "PRIMARY_JS";
  const queryClient = useQueryClient();
  const { data, isLoading } = useChampionshipSchools(championshipId);
  const schools = data?.schools ?? [];

  const [namesText, setNamesText] = React.useState("");
  const [county, setCounty] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: championshipSchoolsKey(championshipId) });

  const addMutation = useMutation({
    mutationFn: (names: string[]) =>
      apiPost<{ added: number; entries: number; skipped: number }>("/api/championship-schools", {
        championshipId,
        names,
        county: county.trim() || undefined,
      }),
    onSuccess: (result) => {
      toast.success(
        `${result.added} school${result.added === 1 ? "" : "s"} added` +
          (splitsByLevel && result.entries > 0 ? ` (${result.entries} Primary/JS entries)` : "") +
          (result.skipped > 0 ? ` - ${result.skipped} already on the list` : ""),
      );
      setNamesText("");
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to add schools"),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => apiPatch(`/api/championship-schools/${id}`, { name }),
    onSuccess: () => {
      toast.success("School renamed");
      setEditingId(null);
      refresh();
      // Bib ranges, teams and team-manager roles carry the school's name too.
      queryClient.invalidateQueries({ queryKey: ["bib-ranges", championshipId] });
      queryClient.invalidateQueries({ queryKey: ["tournament-teams", championshipId] });
      queryClient.invalidateQueries({ queryKey: ["championship-teams-picker", championshipId] });
      queryClient.invalidateQueries({ queryKey: ["championship-roles", championshipId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to rename school"),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/championship-schools/${id}`),
    onSuccess: () => {
      toast.success("School removed");
      refresh();
      queryClient.invalidateQueries({ queryKey: ["bib-ranges", championshipId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to remove school"),
  });

  function addSchools() {
    const names = namesText
      .split("\n")
      .map((n) => n.trim())
      .filter(Boolean);
    if (names.length === 0) {
      toast.error("Enter at least one school name");
      return;
    }
    addMutation.mutate(names);
  }

  function confirmRemove(school: ChampionshipSchoolRow) {
    const extra = school.hasBibRange ? " Its bib range will be removed too." : "";
    if (window.confirm(`Remove ${school.label} from this championship?${extra}`)) {
      removeMutation.mutate(school.id);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schools</CardTitle>
        <CardDescription>
          The schools taking part in this championship. Only these schools can be picked for bib ranges, participants,
          teams and team managers.
          {splitsByLevel && (
            <>
              {" "}
              Each school is added as a Primary and a JS entry, since athletes enter per school level - each entry gets
              its own bib range, and you can remove an entry the school doesn&apos;t need. Renaming a school renames both, along with its teams.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Label htmlFor="school-names">School names (one per line)</Label>
            <Textarea
              id="school-names"
              className="mt-1.5"
              rows={5}
              value={namesText}
              onChange={(e) => setNamesText(e.target.value)}
              placeholder={"Manyonge Primary School\nSt. Mary's Junior School"}
            />
          </div>
          <div className="flex flex-col justify-between gap-3">
            <div>
              <Label htmlFor="school-county">County (optional)</Label>
              <Input
                id="school-county"
                className="mt-1.5"
                value={county}
                onChange={(e) => setCounty(e.target.value)}
                placeholder={championshipCounty}
              />
              <p className="mt-1 text-xs text-muted">Defaults to {championshipCounty}.</p>
            </div>
            <Button onClick={addSchools} disabled={!namesText.trim() || addMutation.isPending}>
              <Plus className="h-4 w-4" /> {addMutation.isPending ? "Adding..." : "Add schools"}
            </Button>
          </div>
        </div>

        {isLoading && <p className="text-muted">Loading schools...</p>}
        {!isLoading && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>School</TableHead>
                <TableHead>County</TableHead>
                <TableHead>Participants</TableHead>
                <TableHead>Teams</TableHead>
                <TableHead>Bib range</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schools.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    {editingId === s.id ? (
                      <form
                        className="flex items-center gap-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (editName.trim()) renameMutation.mutate({ id: s.id, name: editName.trim() });
                        }}
                      >
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus aria-label="School name" />
                        <Button type="submit" size="icon" variant="ghost" aria-label="Save name" disabled={renameMutation.isPending}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button type="button" size="icon" variant="ghost" aria-label="Cancel" onClick={() => setEditingId(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </form>
                    ) : (
                      <span className="flex items-center gap-2">
                        {s.name}
                        {s.schoolLevel && <Badge variant="outline">{gameSchoolLevelLabel(s.schoolLevel)}</Badge>}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{s.county}</TableCell>
                  <TableCell>{s.participantCount}</TableCell>
                  <TableCell>{s.teamCount}</TableCell>
                  <TableCell>
                    {s.hasBibRange ? <Badge variant="secondary">Allocated</Badge> : <Badge variant="outline">None</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Rename ${s.label}`}
                      onClick={() => {
                        setEditingId(s.id);
                        setEditName(s.name);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${s.label}`}
                      disabled={s.participantCount > 0 || s.teamCount > 0}
                      title={
                        s.participantCount > 0 || s.teamCount > 0
                          ? "Remove this school's participants and teams first"
                          : "Remove"
                      }
                      onClick={() => confirmRemove(s)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {schools.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted">
                    No schools yet. Add the schools taking part above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
