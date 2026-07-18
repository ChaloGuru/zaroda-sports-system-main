"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, CheckCircle2, Ban, Undo2, Shuffle, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GenderBadge } from "@/components/ui/gender-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LaneChip } from "@/components/ui/lane-chip";
import { apiGet, apiPost, apiPatch } from "@/lib/api-client";

interface GameOption {
  id: string;
  name: string;
  isTimed: boolean;
}

interface ParticipantRow {
  id: string;
  firstName: string;
  lastName: string;
  bibNumber: number;
  gender: string;
  status: string;
  timeTaken: string | null;
  score: string | null;
  position: number | null;
  school: { name: string } | null;
  tournamentTeam: { name: string } | null;
}

interface HeatParticipantRow {
  id: string;
  participantId: string;
  laneNumber: number | null;
  timeTaken: string | null;
  position: number | null;
  isQualifiedForFinal: boolean;
  participant: {
    firstName: string;
    lastName: string;
    bibNumber: number;
    gender: string;
    school: { name: string } | null;
    tournamentTeam: { name: string } | null;
  };
}

interface HeatRow {
  id: string;
  heatNumber: number;
  heatType: string;
  participants: HeatParticipantRow[];
}

const HEAT_TYPE_PRESETS = ["heat", "semi-final", "final"];

function heatLabel(heat: HeatRow): string {
  if (heat.heatType === "final") return "Final";
  return `${heat.heatType.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} ${heat.heatNumber}`;
}

/**
 * Call room's second job for timed events with heats (sprints etc, unlike a
 * straight final like a 5000m): group checked-in athletes into a heat with
 * lanes auto-seeded by personal best, then - once the Chief Track Judge has
 * scored that heat on the Track Results tab - review its ranked results and
 * decide who actually advances into the next round/final. Qualification is
 * a call-room decision, not an automatic cutoff, even though the backend
 * pre-computes a suggested top-N by finishing position as a starting point.
 */
function HeatsSection({ gameId, candidates }: { gameId: string; candidates: ParticipantRow[] }) {
  const queryClient = useQueryClient();
  const [heatType, setHeatType] = React.useState("heat");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [showFinalPicker, setShowFinalPicker] = React.useState(false);
  const [finalSelected, setFinalSelected] = React.useState<Set<string>>(new Set());

  const { data: heatsData, isLoading } = useQuery({
    queryKey: ["heats", gameId],
    queryFn: () => apiGet<{ heats: HeatRow[] }>(`/api/heats?gameId=${gameId}`),
    enabled: !!gameId,
  });
  const heats = heatsData?.heats ?? [];
  const nextHeatNumber = (Math.max(0, ...heats.filter((h) => h.heatType === heatType).map((h) => h.heatNumber)) || 0) + 1;
  // Every non-final heat's runners are candidates for the Final - qualifiers
  // typically come from several heats (e.g. top 3 of Heat 1 + top 3 of Heat
  // 2), so this has to be one cross-heat selection, not a per-heat action,
  // otherwise advancing from each heat separately would create a duplicate
  // "final" heat per heat instead of one merged Final.
  const nonFinalHeats = heats.filter((h) => h.heatType !== "final");
  const scoredNonFinalHeats = nonFinalHeats.filter((h) => h.participants.some((hp) => hp.timeTaken !== null || hp.position !== null));
  const finalAlreadyExists = heats.some((h) => h.heatType === "final");

  const createHeatMutation = useMutation({
    mutationFn: () =>
      apiPost("/api/heats", {
        gameId,
        heatType,
        heatNumber: nextHeatNumber,
        participantIds: Array.from(selected),
      }),
    onSuccess: () => {
      toast.success("Heat created - lanes seeded by personal best");
      queryClient.invalidateQueries({ queryKey: ["heats", gameId] });
      setSelected(new Set());
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to create heat"),
  });

  const createFinalMutation = useMutation({
    mutationFn: () =>
      apiPost("/api/heats", {
        gameId,
        heatType: "final",
        heatNumber: 1,
        participantIds: Array.from(finalSelected),
      }),
    onSuccess: () => {
      toast.success("Final created with the selected finalists");
      queryClient.invalidateQueries({ queryKey: ["heats", gameId] });
      setShowFinalPicker(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to create the final"),
  });

  function toggle(setFn: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setFn((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openFinalPicker() {
    const suggested = scoredNonFinalHeats.flatMap((h) => h.participants.filter((hp) => hp.isQualifiedForFinal).map((hp) => hp.participantId));
    setFinalSelected(new Set(suggested));
    setShowFinalPicker(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Heats &amp; Lane Assignment</CardTitle>
        <CardDescription>
          For races run in heats (e.g. sprints) - group checked-in athletes into a heat here; lanes are seeded
          automatically by personal best. Skip this for events run straight to a final (e.g. long-distance races) -
          just check athletes in above and let the Chief Track Judge score them directly on Track Results.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3 rounded-md border border-border p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-sm font-medium text-foreground">Round</label>
              <Select value={heatType} onValueChange={setHeatType}>
                <SelectTrigger className="mt-1.5 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HEAT_TYPE_PRESETS.map((t) => (
                    <SelectItem key={t} value={t}>{t.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="pb-2 text-sm text-muted">Will be created as #{nextHeatNumber}</p>
          </div>
          <p className="text-sm font-medium text-foreground">Select checked-in athletes for this heat</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {candidates.map((p) => (
              <label key={p.id} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(setSelected, p.id)} />
                <LaneChip value={p.bibNumber} />
                <span>{p.firstName} {p.lastName}</span>
                <GenderBadge gender={p.gender} className="ml-auto" />
              </label>
            ))}
            {candidates.length === 0 && <p className="text-sm text-muted">No checked-in athletes yet.</p>}
          </div>
          <Button size="sm" disabled={selected.size === 0 || createHeatMutation.isPending} onClick={() => createHeatMutation.mutate()}>
            <Shuffle className="h-4 w-4" /> {createHeatMutation.isPending ? "Creating..." : `Create heat with ${selected.size} athlete${selected.size === 1 ? "" : "s"}`}
          </Button>
        </div>

        {isLoading && <p className="text-muted">Loading heats...</p>}
        {!isLoading && heats.length === 0 && <p className="text-muted">No heats created yet for this game.</p>}
        {heats.map((heat) => (
          <div key={heat.id} className="space-y-2 rounded-md border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-foreground">{heatLabel(heat)}</p>
              {heat.heatType !== "final" && !heat.participants.some((hp) => hp.timeTaken !== null || hp.position !== null) && (
                <span className="text-xs text-muted">Waiting on Track Results</span>
              )}
            </div>
            <div className="space-y-1">
              {heat.participants.map((hp) => (
                <div key={hp.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-10 font-mono text-muted">L{hp.laneNumber ?? "-"}</span>
                  <LaneChip value={hp.participant.bibNumber} />
                  <span>{hp.participant.firstName} {hp.participant.lastName}</span>
                  <GenderBadge gender={hp.participant.gender} />
                  <span className="text-muted">{hp.participant.school?.name ?? hp.participant.tournamentTeam?.name ?? "-"}</span>
                  {hp.timeTaken && <span className="font-mono tabular-nums text-foreground">{hp.timeTaken}</span>}
                  {hp.position && <Badge variant="outline">Pos {hp.position}</Badge>}
                  {hp.isQualifiedForFinal && <Badge variant="success">Qualifying</Badge>}
                </div>
              ))}
            </div>
          </div>
        ))}

        {scoredNonFinalHeats.length > 0 && !finalAlreadyExists && !showFinalPicker && (
          <Button size="sm" variant="secondary" onClick={openFinalPicker}>
            <ArrowUpRight className="h-4 w-4" /> Qualify finalists from scored heats
          </Button>
        )}

        {showFinalPicker && (
          <div className="space-y-2 rounded-md border border-primary/40 bg-secondary/40 p-4">
            <p className="text-sm font-medium text-foreground">
              Select finalists across all scored heats (pre-checked from each heat&apos;s ranked finish, adjust as needed)
            </p>
            {scoredNonFinalHeats.map((heat) => (
              <div key={heat.id} className="space-y-1">
                <p className="text-xs font-medium uppercase text-muted">{heatLabel(heat)}</p>
                {heat.participants.map((hp) => (
                  <label key={hp.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={finalSelected.has(hp.participantId)}
                      onChange={() => toggle(setFinalSelected, hp.participantId)}
                    />
                    {hp.participant.firstName} {hp.participant.lastName} {hp.position && `(Pos ${hp.position})`}
                  </label>
                ))}
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Button size="sm" disabled={finalSelected.size === 0 || createFinalMutation.isPending} onClick={() => createFinalMutation.mutate()}>
                {createFinalMutation.isPending ? "Creating Final..." : `Create Final with ${finalSelected.size} finalist${finalSelected.size === 1 ? "" : "s"}`}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowFinalPicker(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Call room is eligibility only - confirm the athlete is present/eligible
 * and push them to the track, or scratch them. Race results (time/score/
 * position) are entered by the Chief Track Judge on the Track Results tab
 * once the race has actually run, not here.
 */
function ParticipantRowEditor({ participant, gameId }: { participant: ParticipantRow; gameId: string }) {
  const queryClient = useQueryClient();

  const patchMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPatch(`/api/participants/${participant.id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call-room-participants", gameId] });
      toast.success("Updated");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Update failed"),
  });

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <LaneChip value={participant.bibNumber} size="lg" />
        <div>
          <p className="flex items-center gap-2 font-medium text-foreground">
            {participant.firstName} {participant.lastName}
            <GenderBadge gender={participant.gender} />
          </p>
          <p className="text-sm text-muted">{participant.school?.name ?? participant.tournamentTeam?.name ?? "-"}</p>
          <Badge variant={participant.status === "DISQUALIFIED" ? "destructive" : participant.status === "CONFIRMED_IN_CALL_ROOM" ? "success" : "outline"}>
            {participant.status.replace(/_/g, " ")}
          </Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {participant.status === "CONFIRMED_IN_CALL_ROOM" ? (
          <Button
            size="default"
            variant="outline"
            className="h-11"
            onClick={() => patchMutation.mutate({ status: "REGISTERED" })}
          >
            <Undo2 className="h-4 w-4" /> Undo check-in
          </Button>
        ) : (
          <Button
            size="default"
            variant="outline"
            className="h-11"
            onClick={() => patchMutation.mutate({ status: "CONFIRMED_IN_CALL_ROOM" })}
          >
            <CheckCircle2 className="h-4 w-4" /> Check in - push to track
          </Button>
        )}
        <Button size="default" variant="destructive" className="h-11" onClick={() => patchMutation.mutate({ status: "DISQUALIFIED" })}>
          <Ban className="h-4 w-4" /> DQ
        </Button>
      </div>
    </div>
  );
}

export function CallRoomPanel({ championshipId }: { championshipId: string }) {
  const [gameId, setGameId] = React.useState("");
  const [search, setSearch] = React.useState("");

  const { data: gamesData } = useQuery({
    queryKey: ["games", championshipId],
    queryFn: () => apiGet<{ games: GameOption[] }>(`/api/games?championshipId=${championshipId}`),
  });

  const { data: participantsData } = useQuery({
    queryKey: ["call-room-participants", gameId],
    queryFn: () => apiGet<{ participants: ParticipantRow[] }>(`/api/participants?gameId=${gameId}`),
    enabled: !!gameId,
  });

  const filtered = (participantsData?.participants ?? []).filter(
    (p) => !search || p.bibNumber.toString().includes(search) || `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()),
  );
  const checkedIn = (participantsData?.participants ?? []).filter((p) => p.status === "CONFIRMED_IN_CALL_ROOM");
  const selectedGame = (gamesData?.games ?? []).find((g) => g.id === gameId);

  return (
    <div className="space-y-6">
      <Card className="border-navy-dark bg-navy">
        <CardHeader className="flex flex-col gap-3 border-b border-white/10 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-white">Call Room</CardTitle>
          <div className="flex flex-1 flex-wrap items-center gap-3 sm:justify-end">
            <Select value={gameId} onValueChange={setGameId}>
              <SelectTrigger className="h-11 w-64">
                <SelectValue placeholder="Select a game" />
              </SelectTrigger>
              <SelectContent>
                {(gamesData?.games ?? []).map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                placeholder="Search bib or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 w-56 pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-6">
          {!gameId && <p className="text-white/70">Select a game to open its call room.</p>}
          {gameId && filtered.length === 0 && <p className="text-white/70">No matching participants.</p>}
          {gameId &&
            filtered.map((p) => (
              <ParticipantRowEditor key={p.id} participant={p} gameId={gameId} />
            ))}
        </CardContent>
      </Card>

      {gameId && selectedGame?.isTimed && <HeatsSection gameId={gameId} candidates={checkedIn} />}
    </div>
  );
}
