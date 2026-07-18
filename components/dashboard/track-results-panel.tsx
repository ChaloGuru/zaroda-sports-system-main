"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GenderBadge } from "@/components/ui/gender-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LaneChip } from "@/components/ui/lane-chip";
import { apiGet, apiPatch } from "@/lib/api-client";

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

function heatLabel(heat: HeatRow): string {
  if (heat.heatType === "final") return "Final";
  return `${heat.heatType.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} ${heat.heatNumber}`;
}

/**
 * Race/event results entry - the Chief Track Judge's job once the Call Room
 * has already grouped athletes into a heat (with lanes) and pushed them to
 * the track, or - for events with no heats (e.g. a straight final like a
 * 5000m) - simply confirmed them eligible. The judge only records what
 * happened in the race; heat/lane assignment and who qualifies for the next
 * round are Call Room decisions made elsewhere.
 */
function HeatResultsForm({ heat, gameId, isTimed }: { heat: HeatRow; gameId: string; isTimed: boolean }) {
  const queryClient = useQueryClient();
  const [values, setValues] = React.useState<Record<string, { result: string; position: string }>>(() =>
    Object.fromEntries(
      heat.participants.map((hp) => [
        hp.participantId,
        { result: isTimed ? (hp.timeTaken ?? "") : "", position: hp.position?.toString() ?? "" },
      ]),
    ),
  );

  const saveMutation = useMutation({
    mutationFn: () =>
      apiPatch(`/api/heats/${heat.id}`, {
        results: heat.participants.map((hp) => {
          const v = values[hp.participantId] ?? { result: "", position: "" };
          return {
            participantId: hp.participantId,
            timeInput: isTimed && v.result ? v.result : undefined,
            score: !isTimed && v.result ? Number(v.result) : undefined,
            position: v.position ? Number(v.position) : undefined,
          };
        }),
      }),
    onSuccess: () => {
      toast.success(`${heatLabel(heat)} results saved`);
      queryClient.invalidateQueries({ queryKey: ["track-results-heats", gameId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to save heat results"),
  });

  return (
    <div className="space-y-2 rounded-md border border-border bg-white p-4">
      <p className="font-medium text-foreground">{heatLabel(heat)}</p>
      {heat.participants.map((hp) => (
        <div key={hp.id} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <span className="w-8 font-mono text-sm text-muted">L{hp.laneNumber ?? "-"}</span>
          <LaneChip value={hp.participant.bibNumber} />
          <span className="min-w-0 flex-1 text-sm">
            {hp.participant.firstName} {hp.participant.lastName}
            <span className="ml-2 text-muted">{hp.participant.school?.name ?? hp.participant.tournamentTeam?.name ?? "-"}</span>
          </span>
          <GenderBadge gender={hp.participant.gender} />
          <Input
            placeholder={isTimed ? "Time" : "Score"}
            value={values[hp.participantId]?.result ?? ""}
            onChange={(e) => setValues((prev) => ({ ...prev, [hp.participantId]: { ...prev[hp.participantId], result: e.target.value, position: prev[hp.participantId]?.position ?? "" } }))}
            className="h-9 w-32 font-mono tabular-nums"
          />
          <Input
            placeholder="Pos"
            value={values[hp.participantId]?.position ?? ""}
            onChange={(e) => setValues((prev) => ({ ...prev, [hp.participantId]: { ...prev[hp.participantId], position: e.target.value, result: prev[hp.participantId]?.result ?? "" } }))}
            className="h-9 w-16 font-mono tabular-nums"
          />
        </div>
      ))}
      <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        <Save className="h-4 w-4" /> {saveMutation.isPending ? "Saving..." : `Save ${heatLabel(heat)} results`}
      </Button>
    </div>
  );
}

/** Direct-final mode (no heats for this game) - unchanged flat participant entry. */
function ResultRowEditor({ participant, gameId, isTimed }: { participant: ParticipantRow; gameId: string; isTimed: boolean }) {
  const queryClient = useQueryClient();
  const [resultValue, setResultValue] = React.useState(isTimed ? "" : (participant.score ?? ""));
  const [position, setPosition] = React.useState(participant.position?.toString() ?? "");

  const patchMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPatch(`/api/participants/${participant.id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["track-results-participants", gameId] });
      toast.success("Result saved");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to save result"),
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
          <Badge variant="outline">{isTimed ? (participant.timeTaken ?? "No time yet") : (participant.score ?? "No score yet")}</Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder={isTimed ? "Time (12.06 or 1:23.45)" : "Score"}
          value={resultValue}
          onChange={(e) => setResultValue(e.target.value)}
          className="h-11 w-40 font-mono tabular-nums"
        />
        <Input
          placeholder="Position"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          className="h-11 w-24 font-mono tabular-nums"
        />
        <Button
          size="default"
          variant="secondary"
          className="h-11"
          onClick={() =>
            patchMutation.mutate({
              timeInput: isTimed && resultValue ? resultValue : undefined,
              score: !isTimed && resultValue ? Number(resultValue) : undefined,
              position: position ? Number(position) : undefined,
            })
          }
        >
          <Save className="h-4 w-4" /> Save result
        </Button>
      </div>
    </div>
  );
}

export function TrackResultsPanel({ championshipId }: { championshipId: string }) {
  const [gameId, setGameId] = React.useState("");
  const [search, setSearch] = React.useState("");

  const { data: gamesData } = useQuery({
    queryKey: ["games", championshipId],
    queryFn: () => apiGet<{ games: GameOption[] }>(`/api/games?championshipId=${championshipId}`),
  });

  const { data: heatsData, isLoading: heatsLoading } = useQuery({
    queryKey: ["track-results-heats", gameId],
    queryFn: () => apiGet<{ heats: HeatRow[] }>(`/api/heats?gameId=${gameId}`),
    enabled: !!gameId,
  });
  const heats = heatsData?.heats ?? [];
  const usesHeats = heats.length > 0;

  const { data: participantsData } = useQuery({
    queryKey: ["track-results-participants", gameId],
    queryFn: () => apiGet<{ participants: ParticipantRow[] }>(`/api/participants?gameId=${gameId}`),
    enabled: !!gameId && !usesHeats,
  });

  const onTrack = (participantsData?.participants ?? []).filter((p) => p.status === "CONFIRMED_IN_CALL_ROOM");
  const filtered = onTrack.filter(
    (p) => !search || p.bibNumber.toString().includes(search) || `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()),
  );
  const selectedGame = (gamesData?.games ?? []).find((g) => g.id === gameId);
  const notYetPushed = (participantsData?.participants ?? []).length - onTrack.length - (participantsData?.participants ?? []).filter((p) => p.status === "DISQUALIFIED").length;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Track Results</CardTitle>
          <CardDescription>
            Chief Track Judge: enter the race/event result for whichever heat or final the Call Room has pushed to the track.
          </CardDescription>
        </div>
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
          {!usesHeats && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                placeholder="Search bib or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 w-56 pl-9"
              />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!gameId && <p className="text-muted">Select a game to enter its results.</p>}

        {gameId && heatsLoading && <p className="text-muted">Loading...</p>}

        {gameId && !heatsLoading && usesHeats && (
          <>
            <p className="text-sm text-muted">
              This game runs in heats - score each heat below. Once a heat is scored, the Call Room decides who
              qualifies for the next round/final.
            </p>
            {heats.map((heat) => (
              <HeatResultsForm key={heat.id} heat={heat} gameId={gameId} isTimed={selectedGame?.isTimed ?? true} />
            ))}
          </>
        )}

        {gameId && !heatsLoading && !usesHeats && (
          <>
            {onTrack.length === 0 && (
              <p className="text-muted">No athletes have been pushed to the track yet - confirm them in the Call Room first.</p>
            )}
            {onTrack.length > 0 && filtered.length === 0 && <p className="text-muted">No matching athletes.</p>}
            {notYetPushed > 0 && (
              <p className="text-sm text-muted">{notYetPushed} more athlete{notYetPushed === 1 ? "" : "s"} still waiting in the call room.</p>
            )}
            {filtered.map((p) => (
              <ResultRowEditor key={p.id} participant={p} gameId={gameId} isTimed={selectedGame?.isTimed ?? true} />
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
