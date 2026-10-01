"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GenderBadge } from "@/components/ui/gender-badge";
import { LaneChip } from "@/components/ui/lane-chip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPut } from "@/lib/api-client";
import { useCanManageGame } from "@/hooks/use-game-access";
import { MAX_FIELD_ATTEMPTS, bestMark, isFieldEvent, isVerticalJump, normalizeAttempt, rankFieldResults } from "@/lib/field-events";
import type { Role } from "@prisma/client";

const FIELD_RESULTS_ROLES: Role[] = ["TOURNAMENT_ADMIN", "SCOREKEEPER", "CHIEF_FIELD_JUDGE", "CHIEF_RECORDER"];
const QUALIFYING_ATTEMPTS = 3;
const EMPTY_ROW = { attempts: Array<string>(MAX_FIELD_ATTEMPTS).fill(""), position: "", positionEdited: false };

interface GameOption {
  id: string;
  name: string;
  category: string;
  sport: string | null;
  isTimed: boolean;
}

interface ParticipantRow {
  id: string;
  firstName: string;
  lastName: string;
  bibNumber: number;
  gender: string;
  status: string;
  position: number | null;
  fieldAttempts: string[];
  school: { name: string } | null;
  tournamentTeam: { name: string } | null;
}

interface SheetRow {
  attempts: string[];
  position: string;
  /** Set once the judge types a position, so re-ranking stops overwriting it. */
  positionEdited: boolean;
}

/** Best mark from what's typed so far, ignoring entries that don't parse yet. */
function liveAttempts(attempts: string[]): string[] {
  return attempts.flatMap((a) => {
    try {
      const normalized = normalizeAttempt(a);
      return normalized ? [normalized] : [];
    } catch {
      return [];
    }
  });
}

function FieldResultsSheet({ game, athletes, canManage }: { game: GameOption; athletes: ParticipantRow[]; canManage: boolean }) {
  const queryClient = useQueryClient();
  const vertical = isVerticalJump(game.name);
  const [showFinalAttempts, setShowFinalAttempts] = React.useState(() =>
    athletes.some((a) => a.fieldAttempts.length > QUALIFYING_ATTEMPTS),
  );
  const attemptCount = vertical ? 1 : showFinalAttempts ? MAX_FIELD_ATTEMPTS : QUALIFYING_ATTEMPTS;

  const [sheet, setSheet] = React.useState<Record<string, SheetRow>>(() =>
    Object.fromEntries(
      athletes.map((a) => [
        a.id,
        {
          attempts: Array.from({ length: MAX_FIELD_ATTEMPTS }, (_, i) => a.fieldAttempts[i] ?? ""),
          position: a.position?.toString() ?? "",
          // Horizontal events re-place from marks; a saved vertical-jump placing may
          // include a countback, so keep it unless the judge re-places.
          positionEdited: vertical && a.position !== null,
        },
      ]),
    ),
  );

  function setAttempt(participantId: string, index: number, value: string) {
    setSheet((prev) => {
      const current = prev[participantId];
      if (!current) return prev;
      const next = { ...prev, [participantId]: { ...current, attempts: current.attempts.map((a, i) => (i === index ? value : a)) } };
      // Re-place everyone whose position the judge hasn't set by hand.
      const ranks = rankFieldResults(athletes.map((a) => ({ id: a.id, attempts: liveAttempts(next[a.id]?.attempts ?? []) })));
      for (const a of athletes) {
        const row = next[a.id];
        if (row && !row.positionEdited) next[a.id] = { ...row, position: ranks.get(a.id)?.toString() ?? "" };
      }
      return next;
    });
  }

  function setPosition(participantId: string, value: string) {
    setSheet((prev) => {
      const current = prev[participantId];
      return current ? { ...prev, [participantId]: { ...current, position: value, positionEdited: value !== "" } } : prev;
    });
  }

  function autoPlace() {
    const ranks = rankFieldResults(athletes.map((a) => ({ id: a.id, attempts: liveAttempts(sheet[a.id]?.attempts ?? []) })));
    setSheet((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([id, row]) => [id, { ...row, position: ranks.get(id)?.toString() ?? "", positionEdited: false }]),
      ),
    );
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      apiPut(`/api/games/${game.id}/field-results`, {
        results: athletes.map((a) => {
          const row = sheet[a.id] ?? EMPTY_ROW;
          return {
            participantId: a.id,
            attempts: row.attempts.slice(0, attemptCount),
            position: row.position ? Number(row.position) : null,
          };
        }),
      }),
    onSuccess: () => {
      toast.success(`${game.name} results saved`);
      queryClient.invalidateQueries({ queryKey: ["field-results-participants", game.id] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to save results"),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <p>
          {vertical
            ? "Enter each athlete's best height cleared in metres. Places fill in by height - adjust them for countback on failures."
            : "Enter each attempt in metres (e.g. 5.32), X for a foul or - for a pass. The best mark and places fill in automatically; ties are split on the next-best mark."}
        </p>
        <div className="flex gap-2">
          {!vertical && (
            <Button size="sm" variant="outline" onClick={() => setShowFinalAttempts((v) => !v)}>
              {showFinalAttempts ? "Hide attempts 4-6" : "Add attempts 4-6 (final)"}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={autoPlace} disabled={!canManage}>
            Re-place by marks
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised text-left text-xs uppercase text-muted">
            <tr>
              <th className="px-3 py-2">Bib</th>
              <th className="px-3 py-2">Athlete</th>
              {Array.from({ length: attemptCount }).map((_, i) => (
                <th key={i} className="px-1 py-2 text-center">{vertical ? "Height (m)" : `A${i + 1}`}</th>
              ))}
              {!vertical && <th className="px-3 py-2 text-center">Best</th>}
              <th className="px-3 py-2 text-center">Pos</th>
            </tr>
          </thead>
          <tbody>
            {athletes.map((a) => {
              const row = sheet[a.id] ?? EMPTY_ROW;
              const best = bestMark(liveAttempts(row.attempts.slice(0, attemptCount)));
              return (
                <tr key={a.id} className="border-t border-border">
                  <td className="px-3 py-2"><LaneChip value={a.bibNumber} /></td>
                  <td className="min-w-48 px-3 py-2">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      {a.firstName} {a.lastName} <GenderBadge gender={a.gender} />
                    </span>
                    <span className="text-xs text-muted">{a.school?.name ?? a.tournamentTeam?.name ?? "-"}</span>
                  </td>
                  {Array.from({ length: attemptCount }).map((_, i) => (
                    <td key={i} className="px-1 py-2">
                      <Input
                        aria-label={`${a.firstName} ${a.lastName} ${vertical ? "height" : `attempt ${i + 1}`}`}
                        value={row.attempts[i]}
                        onChange={(e) => setAttempt(a.id, i, e.target.value)}
                        disabled={!canManage}
                        className="h-9 w-20 text-center font-mono tabular-nums"
                      />
                    </td>
                  ))}
                  {!vertical && (
                    <td className="px-3 py-2 text-center font-mono font-semibold tabular-nums text-foreground">
                      {best !== null ? best.toFixed(2) : "-"}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <Input
                      aria-label={`${a.firstName} ${a.lastName} position`}
                      value={row.position}
                      onChange={(e) => setPosition(a.id, e.target.value)}
                      disabled={!canManage}
                      className="mx-auto h-9 w-16 text-center font-mono tabular-nums"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Button onClick={() => saveMutation.mutate()} disabled={!canManage || saveMutation.isPending}>
        <Save className="h-4 w-4" /> {saveMutation.isPending ? "Saving..." : `Save ${game.name} results`}
      </Button>
    </div>
  );
}

/**
 * Field-event (jumps & throws) results entry - the Chief Field Judge's sheet.
 * Unlike a race, each athlete gets a series of attempts; the best valid mark
 * decides the placing.
 */
export function FieldResultsPanel({ championshipId }: { championshipId: string }) {
  const [gameId, setGameId] = React.useState("");

  const { data: gamesData } = useQuery({
    queryKey: ["games", championshipId],
    queryFn: () => apiGet<{ games: GameOption[] }>(`/api/games?championshipId=${championshipId}`),
  });
  const fieldGames = (gamesData?.games ?? []).filter(isFieldEvent);
  const selectedGame = fieldGames.find((g) => g.id === gameId);

  const { data: participantsData, isLoading } = useQuery({
    queryKey: ["field-results-participants", gameId],
    queryFn: () => apiGet<{ participants: ParticipantRow[] }>(`/api/participants?gameId=${gameId}`),
    enabled: !!gameId,
  });
  const participants = participantsData?.participants ?? [];
  // Athletes the Call Room has confirmed, plus anyone who already has a mark
  // recorded (so a saved result never disappears from the sheet).
  const athletes = participants.filter(
    (p) => p.status === "CONFIRMED_IN_CALL_ROOM" || (p.status !== "DISQUALIFIED" && p.fieldAttempts.length > 0),
  );
  const waiting = participants.filter((p) => p.status === "REGISTERED" && p.fieldAttempts.length === 0).length;
  const canManage = useCanManageGame(championshipId, FIELD_RESULTS_ROLES, selectedGame);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Field Results</CardTitle>
          <CardDescription>Chief Field Judge: record each athlete&apos;s attempts in the jumps and throws.</CardDescription>
        </div>
        <Select value={gameId} onValueChange={setGameId}>
          <SelectTrigger className="h-11 w-64">
            <SelectValue placeholder="Select a field event" />
          </SelectTrigger>
          <SelectContent>
            {fieldGames.map((g) => (
              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-3">
        {fieldGames.length === 0 && <p className="text-muted">This championship has no field events.</p>}
        {fieldGames.length > 0 && !gameId && <p className="text-muted">Select a field event to enter its results.</p>}
        {gameId && isLoading && <p className="text-muted">Loading...</p>}
        {gameId && !canManage && (
          <p className="text-sm text-[#B45309]">Only the Chief Field Judge (or a tournament admin) can enter field results for this event.</p>
        )}
        {gameId && !isLoading && athletes.length === 0 && (
          <p className="text-muted">No athletes confirmed for this event yet - confirm them in the Call Room first.</p>
        )}
        {gameId && waiting > 0 && (
          <p className="text-sm text-muted">{waiting} more athlete{waiting === 1 ? "" : "s"} still waiting in the call room.</p>
        )}
        {selectedGame && !isLoading && athletes.length > 0 && (
          // Re-mount per event (and when the roster changes) so the sheet starts from saved results.
          <FieldResultsSheet
            key={`${selectedGame.id}:${athletes.map((a) => a.id).join(",")}`}
            game={selectedGame}
            athletes={athletes}
            canManage={canManage}
          />
        )}
      </CardContent>
    </Card>
  );
}
