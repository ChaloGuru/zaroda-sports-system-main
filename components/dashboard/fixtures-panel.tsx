"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Shuffle, Trash2, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LaneChip } from "@/components/ui/lane-chip";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { computeStandings, type BallSport, type MatchResult, type StandingRow } from "@/lib/scoring";

interface GameOption {
  id: string;
  name: string;
  category: string;
  isTimed: boolean;
  sport: BallSport | null;
}

interface TeamOption {
  id: string;
  name: string;
  gender: string;
  poolId: string | null;
  teamColor: string | null;
}

interface PoolOption {
  id: string;
  name: string;
  _count: { teams: number };
}

interface MatchPoolRow {
  id: string;
  poolId: string | null;
  roundName: string;
  matchDate: string | null;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  teamAScore: number | null;
  teamBScore: number | null;
  winnerId: string | null;
}

const BALL_SPORTS: BallSport[] = [
  "FOOTBALL",
  "BASKETBALL",
  "VOLLEYBALL",
  "HANDBALL",
  "RUGBY",
  "NETBALL",
  "CHESS",
  "TABLE_TENNIS",
  "BADMINTON",
];

const SPORT_LABELS: Record<BallSport, string> = {
  FOOTBALL: "Goals",
  BASKETBALL: "Points",
  VOLLEYBALL: "Sets",
  HANDBALL: "Goals",
  RUGBY: "Points",
  NETBALL: "Goals",
  CHESS: "Boards",
  TABLE_TENNIS: "Games",
  BADMINTON: "Games",
};

const KNOCKOUT_ROUND_PRESETS = ["Semi Final 1", "Semi Final 2", "Final", "3rd Place Playoff"];

function sportLabel(sport: string): string {
  return sport
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

function FixtureRow({ fixture, onChanged, showMatchDay }: { fixture: MatchPoolRow; onChanged: () => void; showMatchDay: boolean }) {
  const [scoreA, setScoreA] = React.useState(fixture.teamAScore?.toString() ?? "");
  const [scoreB, setScoreB] = React.useState(fixture.teamBScore?.toString() ?? "");
  const [matchDate, setMatchDate] = React.useState(fixture.matchDate ? fixture.matchDate.slice(0, 10) : "");
  const [saving, setSaving] = React.useState(false);

  async function saveScores() {
    setSaving(true);
    try {
      await apiPatch(`/api/match-pools/${fixture.id}`, {
        teamAScore: scoreA === "" ? null : Number(scoreA),
        teamBScore: scoreB === "" ? null : Number(scoreB),
        matchDate: matchDate === "" ? null : matchDate,
      });
      toast.success("Score saved");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save score");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      await apiDelete(`/api/match-pools/${fixture.id}`);
      toast.success("Fixture removed");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove fixture");
    }
  }

  return (
    <TableRow>
      <TableCell className="text-muted">{fixture.roundName}</TableCell>
      {showMatchDay && (
        <TableCell>
          <Input
            type="date"
            className="h-8 w-36 font-mono tabular-nums"
            value={matchDate}
            onChange={(e) => setMatchDate(e.target.value)}
          />
        </TableCell>
      )}
      <TableCell className={fixture.winnerId === fixture.teamAId ? "font-semibold text-primary" : ""}>{fixture.teamAName}</TableCell>
      <TableCell>
        <Input type="number" min={0} className="h-8 w-16 font-mono tabular-nums" value={scoreA} onChange={(e) => setScoreA(e.target.value)} />
      </TableCell>
      <TableCell className="text-muted">-</TableCell>
      <TableCell>
        <Input type="number" min={0} className="h-8 w-16 font-mono tabular-nums" value={scoreB} onChange={(e) => setScoreB(e.target.value)} />
      </TableCell>
      <TableCell className={fixture.winnerId === fixture.teamBId ? "font-semibold text-primary" : ""}>{fixture.teamBName}</TableCell>
      <TableCell>
        {fixture.winnerId === null && fixture.teamAScore !== null && fixture.teamBScore !== null && (
          <span className="text-sm text-muted">Draw</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Button size="sm" variant="secondary" onClick={saveScores} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button size="icon" variant="ghost" onClick={remove} className="ml-2">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function FixturesTable({
  fixtures,
  onChanged,
  emptyMessage,
  showMatchDay,
}: {
  fixtures: MatchPoolRow[];
  onChanged: () => void;
  emptyMessage: string;
  showMatchDay: boolean;
}) {
  if (fixtures.length === 0) return <p className="text-muted">{emptyMessage}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Round</TableHead>
          {showMatchDay && <TableHead>Day</TableHead>}
          <TableHead>Team A</TableHead>
          <TableHead />
          <TableHead />
          <TableHead />
          <TableHead>Team B</TableHead>
          <TableHead />
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {fixtures.map((f) => (
          <FixtureRow key={f.id} fixture={f} onChanged={onChanged} showMatchDay={showMatchDay} />
        ))}
      </TableBody>
    </Table>
  );
}

function StandingsTable({
  title,
  description,
  standings,
  sport,
  teamNameById,
  teamColorById,
}: {
  title: string;
  description?: string;
  standings: StandingRow[];
  sport: BallSport;
  teamNameById: Map<string, string>;
  teamColorById: Map<string, string | null>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
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
              <TableHead>{SPORT_LABELS[sport]} For</TableHead>
              <TableHead>{SPORT_LABELS[sport]} Against</TableHead>
              <TableHead>+/-</TableHead>
              <TableHead>Pts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {standings.map((row, index) => {
              const teamColor = teamColorById.get(row.teamId);
              return (
              <TableRow key={row.teamId} style={teamColor ? { borderLeft: `4px solid ${teamColor}` } : undefined}>
                <TableCell>
                  <LaneChip value={index + 1} rank={index + 1} />
                </TableCell>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    {teamColor && (
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-border"
                        style={{ backgroundColor: teamColor }}
                      />
                    )}
                    {teamNameById.get(row.teamId) ?? "Unknown team"}
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
              );
            })}
            {standings.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted">No fixtures played yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AddFixtureDialog({
  triggerLabel = "Add fixture",
  title,
  teams,
  poolId,
  gameId,
  onAdded,
  roundPresets,
  showMatchDay,
  minDate,
  maxDate,
}: {
  triggerLabel?: string;
  title: string;
  teams: TeamOption[];
  poolId: string | null;
  gameId: string;
  onAdded: () => void;
  roundPresets?: string[];
  showMatchDay?: boolean;
  minDate?: string;
  maxDate?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [teamAId, setTeamAId] = React.useState("");
  const [teamBId, setTeamBId] = React.useState("");
  const [roundName, setRoundName] = React.useState("Round 1");
  const [matchDate, setMatchDate] = React.useState("");

  const addMutation = useMutation({
    mutationFn: () =>
      apiPost("/api/match-pools", { gameId, poolId, roundName, teamAId, teamBId, matchDate: matchDate || null }),
    onSuccess: () => {
      toast.success("Fixture added");
      onAdded();
      setOpen(false);
      setTeamAId("");
      setTeamBId("");
      setRoundName("Round 1");
      setMatchDate("");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to add fixture"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={teams.length < 2}>
          <Plus className="h-4 w-4" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Round name</Label>
            <Input className="mt-1.5" value={roundName} onChange={(e) => setRoundName(e.target.value)} />
            {roundPresets && (
              <div className="mt-2 flex flex-wrap gap-2">
                {roundPresets.map((preset) => (
                  <Button key={preset} type="button" size="sm" variant="outline" onClick={() => setRoundName(preset)}>
                    {preset}
                  </Button>
                ))}
              </div>
            )}
          </div>
          {showMatchDay && (
            <div>
              <Label>Match day</Label>
              <Input
                type="date"
                className="mt-1.5"
                value={matchDate}
                min={minDate}
                max={maxDate}
                onChange={(e) => setMatchDate(e.target.value)}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Team A</Label>
              <Select value={teamAId} onValueChange={setTeamAId}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select team" /></SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Team B</Label>
              <Select value={teamBId} onValueChange={setTeamBId}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select team" /></SelectTrigger>
                <SelectContent>
                  {teams.filter((t) => t.id !== teamAId).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            className="w-full"
            disabled={!teamAId || !teamBId || addMutation.isPending}
            onClick={() => addMutation.mutate()}
          >
            {addMutation.isPending ? "Adding..." : "Add fixture"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PoolSection({
  pool,
  teams,
  fixtures,
  gameId,
  sport,
  teamNameById,
  onChanged,
  onGenerate,
  generating,
  showMatchDay,
  minDate,
  maxDate,
}: {
  pool: PoolOption;
  teams: TeamOption[];
  fixtures: MatchPoolRow[];
  gameId: string;
  sport: BallSport | null;
  teamNameById: Map<string, string>;
  onChanged: () => void;
  onGenerate: () => void;
  generating: boolean;
  showMatchDay: boolean;
  minDate?: string;
  maxDate?: string;
}) {
  const standings = React.useMemo(() => {
    if (!sport) return [];
    const results: MatchResult[] = fixtures
      .filter((f) => f.teamAScore !== null && f.teamBScore !== null)
      .map((f) => ({ teamAId: f.teamAId, teamBId: f.teamBId, teamAScore: f.teamAScore as number, teamBScore: f.teamBScore as number }));
    return computeStandings(teams.map((t) => t.id), results, sport);
  }, [fixtures, teams, sport]);
  const teamColorById = React.useMemo(() => new Map(teams.map((t) => [t.id, t.teamColor])), [teams]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>{pool.name}</CardTitle>
          <CardDescription>
            {teams.length} team{teams.length === 1 ? "" : "s"} - fixtures, score entry, and standings for this pool.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" disabled={teams.length < 2 || generating} onClick={onGenerate}>
            <Shuffle className="h-4 w-4" /> Generate round robin
          </Button>
          <AddFixtureDialog
            title={`Add a fixture to ${pool.name}`}
            teams={teams}
            poolId={pool.id}
            gameId={gameId}
            onAdded={onChanged}
            showMatchDay={showMatchDay}
            minDate={minDate}
            maxDate={maxDate}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <FixturesTable
          fixtures={fixtures}
          onChanged={onChanged}
          emptyMessage="No fixtures yet in this pool - generate a round robin or add one manually above."
          showMatchDay={showMatchDay}
        />
        {sport && (
          <StandingsTable
            title={`${pool.name} standings`}
            standings={standings}
            sport={sport}
            teamNameById={teamNameById}
            teamColorById={teamColorById}
          />
        )}
      </CardContent>
    </Card>
  );
}

export function FixturesPanel({ championshipId }: { championshipId: string }) {
  const queryClient = useQueryClient();
  const [gameId, setGameId] = React.useState<string>("");
  const [newPoolName, setNewPoolName] = React.useState("");
  const [topPerPool, setTopPerPool] = React.useState("1");

  const { data: championshipData } = useQuery({
    queryKey: ["championship", championshipId],
    queryFn: () => apiGet<{ championship: { startDate: string; endDate: string } }>(`/api/championships/${championshipId}`),
  });
  const championshipStart = championshipData?.championship.startDate.slice(0, 10);
  const championshipEnd = championshipData?.championship.endDate.slice(0, 10);
  const isMultiDay = !!championshipStart && !!championshipEnd && championshipStart !== championshipEnd;

  const { data: gamesData } = useQuery({
    queryKey: ["games", championshipId],
    queryFn: () => apiGet<{ games: GameOption[] }>(`/api/games?championshipId=${championshipId}`),
  });
  const fixtureGames = (gamesData?.games ?? []).filter((g) => !g.isTimed);
  const selectedGame = fixtureGames.find((g) => g.id === gameId);

  const { data: teamsData } = useQuery({
    queryKey: ["tournament-teams", championshipId, gameId],
    queryFn: () => apiGet<{ teams: TeamOption[] }>(`/api/tournament-teams?championshipId=${championshipId}&gameId=${gameId}`),
    enabled: !!gameId,
  });
  const teams = teamsData?.teams ?? [];

  const { data: poolsData } = useQuery({
    queryKey: ["pools", gameId],
    queryFn: () => apiGet<{ pools: PoolOption[] }>(`/api/pools?gameId=${gameId}`),
    enabled: !!gameId,
  });
  const pools = poolsData?.pools ?? [];

  const { data: fixturesData, isLoading: fixturesLoading } = useQuery({
    queryKey: ["match-pools", gameId],
    queryFn: () => apiGet<{ matchPools: MatchPoolRow[] }>(`/api/match-pools?gameId=${gameId}`),
    enabled: !!gameId,
  });
  const fixtures = fixturesData?.matchPools ?? [];

  function refetchAll() {
    queryClient.invalidateQueries({ queryKey: ["match-pools", gameId] });
    queryClient.invalidateQueries({ queryKey: ["tournament-teams", championshipId, gameId] });
    queryClient.invalidateQueries({ queryKey: ["pools", gameId] });
  }

  const [fixSport, setFixSport] = React.useState<string>("");
  const setSportMutation = useMutation({
    mutationFn: () => apiPatch(`/api/games/${gameId}`, { sport: fixSport }),
    onSuccess: () => {
      toast.success("Sport saved");
      queryClient.invalidateQueries({ queryKey: ["games", championshipId] });
      setFixSport("");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to save sport"),
  });

  const addPoolMutation = useMutation({
    mutationFn: () => apiPost("/api/pools", { gameId, name: newPoolName }),
    onSuccess: () => {
      toast.success("Pool added");
      queryClient.invalidateQueries({ queryKey: ["pools", gameId] });
      setNewPoolName("");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to add pool"),
  });

  const deletePoolMutation = useMutation({
    mutationFn: (poolId: string) => apiDelete(`/api/pools/${poolId}`),
    onSuccess: () => {
      toast.success("Pool removed");
      refetchAll();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to remove pool"),
  });

  const assignPoolMutation = useMutation({
    mutationFn: ({ teamId, poolId }: { teamId: string; poolId: string | null }) =>
      apiPatch(`/api/tournament-teams/${teamId}`, { poolId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tournament-teams", championshipId, gameId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to move team"),
  });

  const generateMutation = useMutation({
    mutationFn: (poolId: string | null) =>
      apiPost<{ created: number; rounds: number }>("/api/match-pools/generate", { gameId, poolId }),
    onSuccess: (result) => {
      toast.success(
        result.created > 0
          ? `Generated ${result.created} fixture${result.created === 1 ? "" : "s"} across ${result.rounds} round${result.rounds === 1 ? "" : "s"}`
          : "All fixtures for this group already exist",
      );
      refetchAll();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to generate fixtures"),
  });

  const advanceMutation = useMutation({
    mutationFn: () =>
      apiPost<{ created: number; advanced: number }>("/api/match-pools/advance", {
        gameId,
        topPerPool: Number(topPerPool),
      }),
    onSuccess: (result) => {
      toast.success(
        result.created > 0
          ? `Advanced ${result.advanced} team${result.advanced === 1 ? "" : "s"} - ${result.created} knockout fixture${result.created === 1 ? "" : "s"} scheduled`
          : "Knockout fixtures for these advancers already exist",
      );
      refetchAll();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to advance teams"),
  });

  const teamNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const t of teams) map.set(t.id, t.name);
    for (const f of fixtures) {
      map.set(f.teamAId, f.teamAName);
      map.set(f.teamBId, f.teamBName);
    }
    return map;
  }, [teams, fixtures]);

  const teamColorById = React.useMemo(() => new Map(teams.map((t) => [t.id, t.teamColor])), [teams]);

  function standingsFor(teamIds: string[]): StandingRow[] {
    if (!selectedGame?.sport || teamIds.length === 0) return [];
    const teamIdSet = new Set(teamIds);
    const results: MatchResult[] = fixtures
      .filter((f) => f.teamAScore !== null && f.teamBScore !== null && teamIdSet.has(f.teamAId) && teamIdSet.has(f.teamBId))
      .map((f) => ({ teamAId: f.teamAId, teamBId: f.teamBId, teamAScore: f.teamAScore as number, teamBScore: f.teamBScore as number }));
    return computeStandings(teamIds, results, selectedGame.sport);
  }

  const unpooledTeams = teams.filter((t) => !t.poolId);
  // "Unassigned" bucket: fixtures with no pool - either manual knockout
  // pairings (semis/final crossing pools) or, when no pools exist at all,
  // every fixture for the game.
  const unassignedFixtures = fixtures.filter((f) => f.poolId === null);

  // Combined standings across every team in the game - shown when no pools
  // have been created yet (preserves the original simple flat-pool workflow).
  const combinedStandings = standingsFor(teams.map((t) => t.id));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Fixtures &amp; Pooling</CardTitle>
          <CardDescription>Select a ball game/team event to manage its pools, fixtures, scores, and live standings.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-64">
              <Label>Game</Label>
              <Select value={gameId} onValueChange={setGameId}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select a game" /></SelectTrigger>
                <SelectContent>
                  {fixtureGames.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fixtureGames.length === 0 && (
                <p className="mt-1 text-xs text-muted">No non-timed games yet - add one in the Games tab first.</p>
              )}
            </div>

            {gameId && !selectedGame?.sport && (
              <div className="flex items-end gap-2">
                <div>
                  <Label className="text-red-400">Sport not set - pick one to enable standings</Label>
                  <Select value={fixSport} onValueChange={setFixSport}>
                    <SelectTrigger className="mt-1.5 w-40"><SelectValue placeholder="Sport" /></SelectTrigger>
                    <SelectContent>
                      {BALL_SPORTS.map((s) => (
                        <SelectItem key={s} value={s}>{sportLabel(s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" disabled={!fixSport} onClick={() => setSportMutation.mutate()}>
                  Save
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {gameId && (
        <Card>
          <CardHeader>
            <CardTitle>Pools</CardTitle>
            <CardDescription>
              Group teams into pools, generate a bye-aware round robin within each, then manually add knockout fixtures
              (semis, final) once pool play settles who advances.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-56">
                <Label htmlFor="new-pool-name">New pool name</Label>
                <Input
                  id="new-pool-name"
                  className="mt-1.5"
                  placeholder="Pool A"
                  value={newPoolName}
                  onChange={(e) => setNewPoolName(e.target.value)}
                />
              </div>
              <Button size="sm" disabled={!newPoolName.trim() || addPoolMutation.isPending} onClick={() => addPoolMutation.mutate()}>
                <Plus className="h-4 w-4" /> Add pool
              </Button>
            </div>

            {pools.length > 0 && (
              <div className="space-y-3">
                {pools.map((pool) => (
                  <div key={pool.id} className="flex items-center justify-between rounded-md border border-border p-3">
                    <div>
                      <p className="font-medium text-foreground">{pool.name}</p>
                      <p className="text-sm text-muted">{pool._count.teams} team{pool._count.teams === 1 ? "" : "s"}</p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => deletePoolMutation.mutate(pool.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div>
              <Label>Assign teams to pools</Label>
              <div className="mt-2 space-y-2">
                {teams.length === 0 && <p className="text-sm text-muted">No teams registered for this game yet.</p>}
                {teams.map((team) => (
                  <div key={team.id} className="flex items-center justify-between rounded-md border border-border p-2.5">
                    <span className="text-sm text-foreground">{team.name}</span>
                    <Select
                      value={team.poolId ?? "none"}
                      onValueChange={(v) => assignPoolMutation.mutate({ teamId: team.id, poolId: v === "none" ? null : v })}
                    >
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No pool</SelectItem>
                        {pools.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {pools.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                disabled={unpooledTeams.length < 2 || generateMutation.isPending}
                onClick={() => generateMutation.mutate(null)}
              >
                <Shuffle className="h-4 w-4" /> Generate round robin for unpooled teams ({unpooledTeams.length})
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {gameId && !fixturesLoading && pools.map((pool) => (
        <PoolSection
          key={pool.id}
          pool={pool}
          teams={teams.filter((t) => t.poolId === pool.id)}
          fixtures={fixtures.filter((f) => f.poolId === pool.id)}
          gameId={gameId}
          sport={selectedGame?.sport ?? null}
          teamNameById={teamNameById}
          onChanged={refetchAll}
          onGenerate={() => generateMutation.mutate(pool.id)}
          generating={generateMutation.isPending}
          showMatchDay={isMultiDay}
          minDate={championshipStart}
          maxDate={championshipEnd}
        />
      ))}

      {gameId && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{pools.length > 0 ? "Knockout Stage" : "Fixtures"}</CardTitle>
              <CardDescription>
                {pools.length > 0
                  ? "Teams progress from pool play automatically - or pair them manually for extra playoffs."
                  : "Add fixtures manually, or generate a full round robin below."}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {pools.length > 0 && (
                <>
                  <Select value={topPerPool} onValueChange={setTopPerPool}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Top 1 per pool</SelectItem>
                      <SelectItem value="2">Top 2 per pool</SelectItem>
                      <SelectItem value="3">Top 3 per pool</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={() => advanceMutation.mutate()} disabled={advanceMutation.isPending}>
                    <ArrowUpRight className="h-4 w-4" /> {advanceMutation.isPending ? "Advancing..." : "Advance to knockout"}
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="secondary"
                disabled={(pools.length > 0 ? unpooledTeams.length : teams.length) < 2 || generateMutation.isPending}
                onClick={() => generateMutation.mutate(null)}
              >
                <Shuffle className="h-4 w-4" />
                {pools.length > 0 ? `Generate for unpooled teams (${unpooledTeams.length})` : "Generate round robin"}
              </Button>
              <AddFixtureDialog
                title={pools.length > 0 ? "Add a knockout fixture" : "Add a fixture"}
                teams={teams}
                poolId={null}
                gameId={gameId}
                onAdded={refetchAll}
                roundPresets={pools.length > 0 ? KNOCKOUT_ROUND_PRESETS : undefined}
                showMatchDay={isMultiDay}
                minDate={championshipStart}
                maxDate={championshipEnd}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {fixturesLoading && <p className="text-muted">Loading fixtures...</p>}
            {!fixturesLoading && (
              <FixturesTable
                fixtures={unassignedFixtures}
                onChanged={refetchAll}
                emptyMessage={
                  pools.length > 0
                    ? "No knockout fixtures yet. Once pool standings show who's progressing, add the semi-final/final pairings here."
                    : "No fixtures yet. Add one manually or generate a round robin above."
                }
                showMatchDay={isMultiDay}
              />
            )}
            {pools.length === 0 && selectedGame?.sport && (
              <StandingsTable
                title="Standings"
                description={`Auto-updates from saved fixture scores using ${sportLabel(selectedGame.sport)} rules.`}
                standings={combinedStandings}
                sport={selectedGame.sport as BallSport}
                teamNameById={teamNameById}
                teamColorById={teamColorById}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
