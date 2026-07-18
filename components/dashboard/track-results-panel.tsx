"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  status: string;
  timeTaken: string | null;
  score: string | null;
  position: number | null;
}

/**
 * Race/event results entry - the Chief Track Judge's job once an athlete
 * has already been confirmed eligible and pushed to the track by the Call
 * Room. Only athletes with status CONFIRMED_IN_CALL_ROOM are listed here;
 * eligibility itself (check-in/DQ) is handled on the Call Room tab.
 */
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
          <p className="font-medium text-foreground">
            {participant.firstName} {participant.lastName}
          </p>
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

  const { data: participantsData } = useQuery({
    queryKey: ["track-results-participants", gameId],
    queryFn: () => apiGet<{ participants: ParticipantRow[] }>(`/api/participants?gameId=${gameId}`),
    enabled: !!gameId,
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
            Chief Track Judge: enter the race/event result for athletes the Call Room has already confirmed and pushed to the track.
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
      <CardContent className="space-y-3">
        {!gameId && <p className="text-muted">Select a game to enter its results.</p>}
        {gameId && onTrack.length === 0 && (
          <p className="text-muted">
            No athletes have been pushed to the track yet - confirm them in the Call Room first.
          </p>
        )}
        {gameId && onTrack.length > 0 && filtered.length === 0 && <p className="text-muted">No matching athletes.</p>}
        {gameId && notYetPushed > 0 && (
          <p className="text-sm text-muted">{notYetPushed} more athlete{notYetPushed === 1 ? "" : "s"} still waiting in the call room.</p>
        )}
        {gameId &&
          filtered.map((p) => (
            <ResultRowEditor key={p.id} participant={p} gameId={gameId} isTimed={selectedGame?.isTimed ?? true} />
          ))}
      </CardContent>
    </Card>
  );
}
