"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LaneChip } from "@/components/ui/lane-chip";
import { PanelErrorBoundary } from "@/components/error-boundary";
import { apiGet } from "@/lib/api-client";
import { GAME_SCHOOL_LEVELS } from "@/lib/school-levels";

interface RankingRow {
  schoolId: string;
  schoolName: string;
  boysTrack: number;
  boysField: number;
  boysTotal: number;
  girlsTrack: number;
  girlsField: number;
  girlsTotal: number;
  mixedTotal: number;
  grandTotal: number;
  position: number;
}

interface TeamStandingRow {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

interface GameStandings {
  gameId: string;
  gameName: string;
  gender: string;
  sport: string;
  standings: TeamStandingRow[];
}

const SCHOOL_LEVEL_FILTERS = [{ value: "OVERALL", label: "Overall" }, ...GAME_SCHOOL_LEVELS];

function TeamStandingsTable({ game }: { game: GameStandings }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{game.gameName}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>P</TableHead>
              <TableHead>W</TableHead>
              <TableHead>D</TableHead>
              <TableHead>L</TableHead>
              <TableHead>+/-</TableHead>
              <TableHead>Pts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {game.standings.map((row, index) => (
              <TableRow key={row.teamId}>
                <TableCell>
                  <LaneChip value={index + 1} rank={index + 1} />
                </TableCell>
                <TableCell className="font-medium">{row.teamName}</TableCell>
                <TableCell className="font-mono tabular-nums">{row.played}</TableCell>
                <TableCell className="font-mono tabular-nums">{row.won}</TableCell>
                <TableCell className="font-mono tabular-nums">{row.drawn}</TableCell>
                <TableCell className="font-mono tabular-nums">{row.lost}</TableCell>
                <TableCell className="font-mono tabular-nums">{row.gd}</TableCell>
                <TableCell className="font-mono text-base font-bold tabular-nums text-primary">{row.points}</TableCell>
              </TableRow>
            ))}
            {game.standings.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted">No fixtures played yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function StandingsTable({ championshipId }: { championshipId: string }) {
  const [schoolLevel, setSchoolLevel] = React.useState("OVERALL");

  const { data, isLoading } = useQuery({
    queryKey: ["rankings", championshipId, schoolLevel],
    queryFn: () =>
      apiGet<{ standings: RankingRow[]; teamStandings: GameStandings[] }>(
        `/api/rankings?championshipId=${championshipId}&schoolLevel=${schoolLevel}`,
      ),
  });

  const teamStandings = data?.teamStandings ?? [];
  const athleticsStandings = data?.standings ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Select value={schoolLevel} onValueChange={setSchoolLevel}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCHOOL_LEVEL_FILTERS.map((level) => (
              <SelectItem key={level.value} value={level.value}>
                {level.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-muted">Loading standings...</p>}

      {!isLoading && teamStandings.length > 0 && (
        <div className="space-y-6">
          {teamStandings.map((game) => (
            <TeamStandingsTable key={game.gameId} game={game} />
          ))}
        </div>
      )}

      {!isLoading && teamStandings.length === 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead>Boys Track</TableHead>
              <TableHead>Boys Field</TableHead>
              <TableHead>Boys Total</TableHead>
              <TableHead>Girls Track</TableHead>
              <TableHead>Girls Field</TableHead>
              <TableHead>Girls Total</TableHead>
              <TableHead>Grand Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {athleticsStandings.map((row) => (
              <TableRow key={row.schoolId}>
                <TableCell>
                  <LaneChip value={row.position} rank={row.position} />
                </TableCell>
                <TableCell className="font-medium">{row.schoolName}</TableCell>
                <TableCell className="font-mono tabular-nums">{row.boysTrack}</TableCell>
                <TableCell className="font-mono tabular-nums">{row.boysField}</TableCell>
                <TableCell className="font-mono tabular-nums">{row.boysTotal}</TableCell>
                <TableCell className="font-mono tabular-nums">{row.girlsTrack}</TableCell>
                <TableCell className="font-mono tabular-nums">{row.girlsField}</TableCell>
                <TableCell className="font-mono tabular-nums">{row.girlsTotal}</TableCell>
                <TableCell className="font-mono text-base font-bold tabular-nums text-primary">{row.grandTotal}</TableCell>
              </TableRow>
            ))}
            {athleticsStandings.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted">
                  No final results yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export function StandingsPanel({ championshipId }: { championshipId: string }) {
  return (
    <PanelErrorBoundary fallbackTitle="Standings failed to load">
      <StandingsTable championshipId={championshipId} />
    </PanelErrorBoundary>
  );
}
