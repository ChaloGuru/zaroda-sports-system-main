"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Shuffle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { computeStandings, type BallSport, type MatchResult } from "@/lib/scoring";

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
}

interface MatchPoolRow {
  id: string;
  roundName: string;
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

function sportLabel(sport: string): string {
  return sport
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

function FixtureRow({ fixture, onChanged }: { fixture: MatchPoolRow; onChanged: () => void }) {
  const [scoreA, setScoreA] = React.useState(fixture.teamAScore?.toString() ?? "");
  const [scoreB, setScoreB] = React.useState(fixture.teamBScore?.toString() ?? "");
  const [saving, setSaving] = React.useState(false);

  async function saveScores() {
    setSaving(true);
    try {
      await apiPatch(`/api/match-pools/${fixture.id}`, {
        teamAScore: scoreA === "" ? null : Number(scoreA),
        teamBScore: scoreB === "" ? null : Number(scoreB),
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
      <TableCell className={fixture.winnerId === fixture.teamAId ? "font-semibold text-gold" : ""}>{fixture.teamAName}</TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          className="h-8 w-16"
          value={scoreA}
          onChange={(e) => setScoreA(e.target.value)}
        />
      </TableCell>
      <TableCell className="text-muted">-</TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          className="h-8 w-16"
          value={scoreB}
          onChange={(e) => setScoreB(e.target.value)}
        />
      </TableCell>
      <TableCell className={fixture.winnerId === fixture.teamBId ? "font-semibold text-gold" : ""}>{fixture.teamBName}</TableCell>
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

export function FixturesPanel({ championshipId }: { championshipId: string }) {
  const queryClient = useQueryClient();
  const [gameId, setGameId] = React.useState<string>("");
  const [teamAId, setTeamAId] = React.useState<string>("");
  const [teamBId, setTeamBId] = React.useState<string>("");
  const [roundName, setRoundName] = React.useState("Round 1");
  const [addOpen, setAddOpen] = React.useState(false);

  const { data: gamesData } = useQuery({
    queryKey: ["games", championshipId],
    queryFn: () => apiGet<{ games: GameOption[] }>(`/api/games?championshipId=${championshipId}`),
  });
  const fixtureGames = (gamesData?.games ?? []).filter((g) => !g.isTimed);

  const { data: teamsData } = useQuery({
    queryKey: ["tournament-teams", championshipId, gameId],
    queryFn: () => apiGet<{ teams: TeamOption[] }>(`/api/tournament-teams?championshipId=${championshipId}&gameId=${gameId}`),
    enabled: !!gameId,
  });
  const teams = teamsData?.teams ?? [];

  const { data: fixturesData, isLoading: fixturesLoading } = useQuery({
    queryKey: ["match-pools", gameId],
    queryFn: () => apiGet<{ matchPools: MatchPoolRow[] }>(`/api/match-pools?gameId=${gameId}`),
    enabled: !!gameId,
  });
  const fixtures = fixturesData?.matchPools ?? [];

  const selectedGame = fixtureGames.find((g) => g.id === gameId);

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

  function refetchFixtures() {
    queryClient.invalidateQueries({ queryKey: ["match-pools", gameId] });
  }

  const addMutation = useMutation({
    mutationFn: () => apiPost("/api/match-pools", { gameId, roundName, teamAId, teamBId }),
    onSuccess: () => {
      toast.success("Fixture added");
      refetchFixtures();
      setAddOpen(false);
      setTeamAId("");
      setTeamBId("");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to add fixture"),
  });

  const [generating, setGenerating] = React.useState(false);
  async function generateRoundRobin() {
    if (teams.length < 2) {
      toast.error("Add at least two teams before generating fixtures");
      return;
    }
    setGenerating(true);
    try {
      const pairs: Array<[TeamOption, TeamOption]> = [];
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
          const a = teams[i];
          const b = teams[j];
          if (a && b) pairs.push([a, b]);
        }
      }
      for (const [a, b] of pairs) {
        await apiPost("/api/match-pools", { gameId, roundName: "Round Robin", teamAId: a.id, teamBId: b.id });
      }
      toast.success(`Generated ${pairs.length} fixture${pairs.length === 1 ? "" : "s"}`);
      refetchFixtures();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate fixtures");
    } finally {
      setGenerating(false);
    }
  }

  const standings = React.useMemo(() => {
    if (!selectedGame?.sport) return null;
    const results: MatchResult[] = fixtures
      .filter((f) => f.teamAScore !== null && f.teamBScore !== null)
      .map((f) => ({ teamAId: f.teamAId, teamBId: f.teamBId, teamAScore: f.teamAScore as number, teamBScore: f.teamBScore as number }));
    const teamIds = Array.from(new Set(fixtures.flatMap((f) => [f.teamAId, f.teamBId])));
    if (teamIds.length === 0) return null;
    return computeStandings(teamIds, results, selectedGame.sport);
  }, [fixtures, selectedGame]);

  const teamNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const t of teams) map.set(t.id, t.name);
    for (const f of fixtures) {
      map.set(f.teamAId, f.teamAName);
      map.set(f.teamBId, f.teamBName);
    }
    return map;
  }, [teams, fixtures]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Fixtures &amp; Pooling</CardTitle>
          <CardDescription>Select a ball game/team event to manage its fixtures, scores, and live standings.</CardDescription>
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

            {gameId && (
              <>
                <Button variant="secondary" onClick={generateRoundRobin} disabled={generating}>
                  <Shuffle className="h-4 w-4" /> {generating ? "Generating..." : "Generate round robin"}
                </Button>

                <Dialog open={addOpen} onOpenChange={setAddOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4" /> Add fixture
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add a fixture</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Round name</Label>
                        <Input className="mt-1.5" value={roundName} onChange={(e) => setRoundName(e.target.value)} />
                      </div>
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
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {gameId && (
        <Card>
          <CardHeader>
            <CardTitle>Fixtures</CardTitle>
          </CardHeader>
          <CardContent>
            {fixturesLoading && <p className="text-muted">Loading fixtures...</p>}
            {!fixturesLoading && fixtures.length === 0 && (
              <p className="text-muted">No fixtures yet. Add one above or generate a round robin from your registered teams.</p>
            )}
            {!fixturesLoading && fixtures.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Round</TableHead>
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
                    <FixtureRow key={f.id} fixture={f} onChanged={refetchFixtures} />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {gameId && standings && selectedGame?.sport && (
        <Card>
          <CardHeader>
            <CardTitle>Standings</CardTitle>
            <CardDescription>Auto-updates from saved fixture scores using {sportLabel(selectedGame.sport)} rules.</CardDescription>
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
                  <TableHead>{SPORT_LABELS[selectedGame.sport]} For</TableHead>
                  <TableHead>{SPORT_LABELS[selectedGame.sport]} Against</TableHead>
                  <TableHead>+/-</TableHead>
                  <TableHead>Pts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {standings.map((row, index) => (
                  <TableRow key={row.teamId}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="font-medium">{teamNameById.get(row.teamId) ?? "Unknown team"}</TableCell>
                    <TableCell>{row.played}</TableCell>
                    <TableCell>{row.won}</TableCell>
                    <TableCell>{row.drawn}</TableCell>
                    <TableCell>{row.lost}</TableCell>
                    <TableCell>{row.gf}</TableCell>
                    <TableCell>{row.ga}</TableCell>
                    <TableCell>{row.gd}</TableCell>
                    <TableCell className="font-semibold text-gold">{row.points}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
