"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { GenderBadge } from "@/components/ui/gender-badge";
import { LaneChip } from "@/components/ui/lane-chip";
import { apiGet } from "@/lib/api-client";
import { formatSecondsToTime } from "@/lib/scoring";

interface GameSummary {
  id: string;
  name: string;
  category: string;
  gender: string;
  isTimed: boolean;
}

interface ParticipantResult {
  id: string;
  gameId: string;
  firstName: string;
  lastName: string;
  bibNumber: number;
  gender: string;
  position: number | null;
  timeTaken: string | null;
  score: string | null;
  school: { name: string } | null;
  tournamentTeam: { name: string } | null;
}

/**
 * Every individual (Athletics/Music) game's actual results - how each race
 * or event was scored (position, time/score, athlete, institution) - not
 * just the institutional points table on the Standings tab. Ball-games/
 * indoor-games results live on the Games -> fixtures/standings path instead,
 * so only participant-based games are shown here.
 */
export function ResultsPanel({ championshipId, games }: { championshipId: string; games: GameSummary[] }) {
  const individualGames = games.filter((g) => g.category === "ATHLETICS" || g.category === "MUSIC");

  const { data, isLoading } = useQuery({
    queryKey: ["championship-results", championshipId],
    queryFn: () => apiGet<{ participants: ParticipantResult[] }>(`/api/participants?championshipId=${championshipId}`),
  });
  const participants = data?.participants ?? [];

  if (isLoading) return <p className="text-muted">Loading results...</p>;
  if (individualGames.length === 0) {
    return <p className="text-muted">No individual (Athletics/Music) events in this championship yet.</p>;
  }

  return (
    <div className="space-y-6">
      {individualGames.map((game) => {
        const rows = participants
          .filter((p) => p.gameId === game.id && (p.position !== null || p.timeTaken !== null || p.score !== null))
          .sort((a, b) => (a.position ?? 999) - (b.position ?? 999));

        return (
          <Card key={game.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">{game.name}</CardTitle>
                <GenderBadge gender={game.gender} />
              </div>
              <Link href={`/game/${game.id}`} className="text-sm text-primary hover:underline">
                Full details &amp; heats &rarr;
              </Link>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="text-muted">No results recorded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pos</TableHead>
                      <TableHead>Bib</TableHead>
                      <TableHead>Athlete</TableHead>
                      <TableHead>Gender</TableHead>
                      <TableHead>Institution</TableHead>
                      <TableHead>{game.isTimed ? "Time" : "Score"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.position ? <LaneChip value={p.position} rank={p.position} /> : "-"}</TableCell>
                        <TableCell><LaneChip value={p.bibNumber} /></TableCell>
                        <TableCell>{p.firstName} {p.lastName}</TableCell>
                        <TableCell><GenderBadge gender={p.gender} /></TableCell>
                        <TableCell>{p.school?.name ?? p.tournamentTeam?.name ?? "-"}</TableCell>
                        <TableCell className="font-mono tabular-nums">
                          {game.isTimed
                            ? (p.timeTaken ? formatSecondsToTime(Number(p.timeTaken)) : "-")
                            : (p.score ? Number(p.score) : "-")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
