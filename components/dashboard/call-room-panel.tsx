"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, CheckCircle2, Ban, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
          <p className="font-medium text-foreground">
            {participant.firstName} {participant.lastName}
          </p>
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

  return (
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
  );
}
