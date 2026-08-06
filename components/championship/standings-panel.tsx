"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileDown } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/ui/print-button";
import { ShareButton } from "@/components/ui/share-button";
import { LaneChip } from "@/components/ui/lane-chip";
import { PanelErrorBoundary } from "@/components/error-boundary";
import { apiGet } from "@/lib/api-client";
import { GAME_SCHOOL_LEVELS } from "@/lib/school-levels";
import { buildResultsShareMessage } from "@/lib/share-message";
import { downloadOrganizationRankingsPdf } from "@/lib/export-organization-rankings-pdf";

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
  teamColor: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

interface PoolStandings {
  poolId: string;
  poolName: string;
  standings: TeamStandingRow[];
}

interface KnockoutFixtureRow {
  matchId: string;
  roundName: string;
  teamAName: string;
  teamBName: string;
  teamAScore: number | null;
  teamBScore: number | null;
  isWalkover: boolean;
  winnerId: string | null;
  teamAId: string;
  teamBId: string;
}

interface GameStandings {
  gameId: string;
  gameName: string;
  gender: string;
  sport: string;
  standings: TeamStandingRow[];
  pools: PoolStandings[];
  knockout: KnockoutFixtureRow[];
}

interface OrganizationRankingRow {
  name: string;
  points: number;
  position: number;
}

const SCHOOL_LEVEL_FILTERS = [{ value: "OVERALL", label: "Overall" }, ...GAME_SCHOOL_LEVELS];
const GENDER_FILTERS = [
  { value: "OVERALL", label: "Overall" },
  { value: "BOYS", label: "Boys" },
  { value: "GIRLS", label: "Girls" },
];
const POINTS_SCOPE_FILTERS = [
  { value: "ALL", label: "League points (all matches)" },
  { value: "KNOCKOUT_ONLY", label: "Knockout points only" },
];

function OrganizationRankingsTable({ rows, isLoading }: { rows: OrganizationRankingRow[]; isLoading: boolean }) {
  return (
    <Card className="border-2 border-primary">
      <CardHeader>
        <CardTitle className="text-lg">Overall Organization Rankings</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Organization / School / Team</TableHead>
              <TableHead>Total Points</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.name}>
                <TableCell>
                  <LaneChip value={row.position} rank={row.position} />
                </TableCell>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="font-mono text-base font-bold tabular-nums text-primary">{row.points}</TableCell>
              </TableRow>
            ))}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted">
                  No points recorded yet for this filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PoolStandingsSubtable({ pool }: { pool: PoolStandings }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-foreground">{pool.poolName}</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Team</TableHead>
            <TableHead>P</TableHead>
            <TableHead>W</TableHead>
            <TableHead>D</TableHead>
            <TableHead>L</TableHead>
            <TableHead>GF</TableHead>
            <TableHead>GA</TableHead>
            <TableHead>GD</TableHead>
            <TableHead>Pts</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pool.standings.map((row, index) => (
            <TableRow
              key={row.teamId}
              style={row.teamColor ? { borderLeft: `4px solid ${row.teamColor}` } : undefined}
            >
              <TableCell>
                <LaneChip value={index + 1} rank={index + 1} />
              </TableCell>
              <TableCell className="font-medium">
                <span className="flex items-center gap-2">
                  {row.teamColor && (
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-border"
                      style={{ backgroundColor: row.teamColor }}
                    />
                  )}
                  {row.teamName}
                </span>
              </TableCell>
              <TableCell className="font-mono tabular-nums">{row.played}</TableCell>
              <TableCell className="font-mono tabular-nums">{row.won}</TableCell>
              <TableCell className="font-mono tabular-nums">{row.drawn}</TableCell>
              <TableCell className="font-mono tabular-nums">{row.lost}</TableCell>
              <TableCell className="font-mono tabular-nums">{row.gf}</TableCell>
              <TableCell className="font-mono tabular-nums">{row.ga}</TableCell>
              <TableCell className="font-mono tabular-nums">{row.gd}</TableCell>
              <TableCell className="font-mono text-base font-bold tabular-nums text-primary">{row.points}</TableCell>
            </TableRow>
          ))}
          {pool.standings.length === 0 && (
            <TableRow>
              <TableCell colSpan={10} className="text-center text-muted">No fixtures played yet.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function KnockoutResultsTable({ fixtures }: { fixtures: KnockoutFixtureRow[] }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-foreground">Knockout Stage</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Round</TableHead>
            <TableHead>Team A</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Team B</TableHead>
            <TableHead>Result</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fixtures.map((f) => {
            const decided = f.isWalkover || (f.teamAScore !== null && f.teamBScore !== null);
            const winnerName = f.winnerId === f.teamAId ? f.teamAName : f.winnerId === f.teamBId ? f.teamBName : null;
            return (
              <TableRow key={f.matchId}>
                <TableCell className="font-medium">{f.roundName}</TableCell>
                <TableCell className={f.winnerId === f.teamAId ? "font-semibold text-foreground" : undefined}>
                  {f.teamAName}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {f.isWalkover ? "Walkover" : decided ? `${f.teamAScore} - ${f.teamBScore}` : "vs"}
                </TableCell>
                <TableCell className={f.winnerId === f.teamBId ? "font-semibold text-foreground" : undefined}>
                  {f.teamBName}
                </TableCell>
                <TableCell className="text-sm text-muted">
                  {winnerName ? `${winnerName} won` : decided ? "Draw" : "Pending"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function TeamStandingsTable({ game }: { game: GameStandings }) {
  const pools = game.pools.length > 0 ? game.pools : [{ poolId: game.gameId, poolName: "Standings", standings: game.standings }];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{game.gameName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {pools.map((pool) => (
          <PoolStandingsSubtable key={pool.poolId} pool={pool} />
        ))}
        {game.knockout.length > 0 && <KnockoutResultsTable fixtures={game.knockout} />}
      </CardContent>
    </Card>
  );
}

function StandingsTable({ championshipId, championshipName }: { championshipId: string; championshipName: string }) {
  const [schoolLevel, setSchoolLevel] = React.useState("OVERALL");
  const [gender, setGender] = React.useState("OVERALL");
  const [pointsScope, setPointsScope] = React.useState("ALL");
  const [downloading, setDownloading] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["rankings", championshipId, schoolLevel, gender, pointsScope],
    queryFn: () =>
      apiGet<{ standings: RankingRow[]; teamStandings: GameStandings[]; organizationRankings: OrganizationRankingRow[] }>(
        `/api/rankings?championshipId=${championshipId}&schoolLevel=${schoolLevel}&gender=${gender}&pointsScope=${pointsScope}`,
      ),
  });

  const teamStandings = data?.teamStandings ?? [];
  const athleticsStandings = data?.standings ?? [];
  const organizationRankings = data?.organizationRankings ?? [];

  const genderLabel = GENDER_FILTERS.find((g) => g.value === gender)?.label ?? "Overall";
  const schoolLevelLabel = SCHOOL_LEVEL_FILTERS.find((l) => l.value === schoolLevel)?.label ?? "Overall";
  const pointsScopeLabel = POINTS_SCOPE_FILTERS.find((s) => s.value === pointsScope)?.label ?? "League points (all matches)";
  const filterLabel =
    (gender === "OVERALL" && schoolLevel === "OVERALL" ? "Overall" : `${genderLabel} - ${schoolLevelLabel}`) +
    (pointsScope === "KNOCKOUT_ONLY" ? ` - ${pointsScopeLabel}` : "");
  const url = typeof window !== "undefined" ? `${window.location.origin}/rankings?championshipId=${championshipId}` : "";

  async function download() {
    setDownloading(true);
    try {
      await downloadOrganizationRankingsPdf(championshipName, organizationRankings, filterLabel);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download rankings");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="no-print flex flex-wrap items-center gap-2">
          <PrintButton />
          <Button variant="outline" size="sm" onClick={download} disabled={downloading || organizationRankings.length === 0}>
            <FileDown className="h-4 w-4" /> {downloading ? "Downloading..." : "Download PDF"}
          </Button>
          <ShareButton
            title={championshipName}
            message={buildResultsShareMessage(championshipName, url)}
            url={url}
          />
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <Select value={pointsScope} onValueChange={setPointsScope}>
            <SelectTrigger className="w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POINTS_SCOPE_FILTERS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={gender} onValueChange={setGender}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GENDER_FILTERS.map((g) => (
                <SelectItem key={g.value} value={g.value}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
      </div>

      {isLoading && <p className="text-muted">Loading standings...</p>}

      {!isLoading && <OrganizationRankingsTable rows={organizationRankings} isLoading={isLoading} />}

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

export function StandingsPanel({ championshipId, championshipName }: { championshipId: string; championshipName: string }) {
  return (
    <PanelErrorBoundary fallbackTitle="Standings failed to load">
      <StandingsTable championshipId={championshipId} championshipName={championshipName} />
    </PanelErrorBoundary>
  );
}
