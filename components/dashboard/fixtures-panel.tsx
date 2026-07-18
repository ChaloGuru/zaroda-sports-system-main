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
import { PrintButton } from "@/components/ui/print-button";
import { ShareButton } from "@/components/ui/share-button";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { computeStandings, type BallSport, type MatchResult, type StandingRow, type WalkoverResult } from "@/lib/scoring";
import { buildResultsShareMessage } from "@/lib/share-message";
import { isHigherLevel, LEVEL_LABELS } from "@/lib/utils";
import type { Level } from "@prisma/client";

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
  isWalkover: boolean;
}

/** Splits fixtures into normal MatchResults + WalkoverResults for computeStandings. */
function toStandingsInputs(fixtures: MatchPoolRow[]): { results: MatchResult[]; walkovers: WalkoverResult[] } {
  const results: MatchResult[] = fixtures
    .filter((f) => !f.isWalkover && f.teamAScore !== null && f.teamBScore !== null)
    .map((f) => ({ teamAId: f.teamAId, teamBId: f.teamBId, teamAScore: f.teamAScore as number, teamBScore: f.teamBScore as number }));
  const walkovers: WalkoverResult[] = fixtures
    .filter((f) => f.isWalkover && f.winnerId !== null)
    .map((f) => ({ teamAId: f.teamAId, teamBId: f.teamBId, winnerId: f.winnerId as string }));
  return { results, walkovers };
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
        isWalkover: false,
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

  async function markWalkover(walkoverWinnerId: string) {
    setSaving(true);
    try {
      await apiPatch(`/api/match-pools/${fixture.id}`, { isWalkover: true, walkoverWinnerId });
      toast.success("Marked as walkover");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to mark walkover");
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
      {fixture.isWalkover ? (
        <>
          <TableCell colSpan={3} className="text-center text-sm text-muted">
            Walkover - {fixture.winnerId === fixture.teamAId ? fixture.teamAName : fixture.teamBName} awarded the win
          </TableCell>
        </>
      ) : (
        <>
          <TableCell>
            <Input type="number" min={0} className="h-8 w-16 font-mono tabular-nums" value={scoreA} onChange={(e) => setScoreA(e.target.value)} />
          </TableCell>
          <TableCell className="text-muted">-</TableCell>
          <TableCell>
            <Input type="number" min={0} className="h-8 w-16 font-mono tabular-nums" value={scoreB} onChange={(e) => setScoreB(e.target.value)} />
          </TableCell>
        </>
      )}
      <TableCell className={fixture.winnerId === fixture.teamBId ? "font-semibold text-primary" : ""}>{fixture.teamBName}</TableCell>
      <TableCell>
        {!fixture.isWalkover && fixture.winnerId === null && fixture.teamAScore !== null && fixture.teamBScore !== null && (
          <span className="text-sm text-muted">Draw</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        {fixture.isWalkover ? (
          <Button size="sm" variant="secondary" onClick={saveScores} disabled={saving}>
            Undo walkover
          </Button>
        ) : (
          <>
            <Button size="sm" variant="secondary" onClick={saveScores} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
            <Select onValueChange={(teamId) => markWalkover(teamId)}>
              <SelectTrigger className="ml-2 inline-flex h-8 w-32 align-middle text-xs" disabled={saving}>
                <SelectValue placeholder="Walkover..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={fixture.teamAId}>{fixture.teamAName} present</SelectItem>
                <SelectItem value={fixture.teamBId}>{fixture.teamBName} present</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
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
            <p className="mt-1.5 text-xs text-muted">
              Give simultaneous matches (e.g. two semi-finals in a 4-team pool) the exact same round name - once every
              match with that name has a winner, &quot;Advance winners&quot; pairs them into the next round automatically.
            </p>
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
    const { results, walkovers } = toStandingsInputs(fixtures);
    return computeStandings(teams.map((t) => t.id), results, sport, walkovers);
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
          emptyMessage="No fixtures yet in this pool - generate a round robin or add one manually above. Fixtures are visible to the public as soon as they're added, even before scores are entered, so schedule them ahead of match day."
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

interface SemifinalRule {
  id: string;
  roundName: string;
  poolAId: string;
  rankA: number;
  poolBId: string;
  rankB: number;
}

const RANK_OPTIONS = [1, 2, 3];

function SemifinalRulesCard({
  pools,
  poolStandingsById,
  teamNameById,
  rules,
  onRulesChange,
  onGenerate,
  generating,
}: {
  pools: PoolOption[];
  poolStandingsById: Map<string, StandingRow[]>;
  teamNameById: Map<string, string>;
  rules: SemifinalRule[];
  onRulesChange: (rules: SemifinalRule[]) => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  function addRule() {
    onRulesChange([
      ...rules,
      {
        id: crypto.randomUUID(),
        roundName: "Semifinal",
        poolAId: pools[0]?.id ?? "",
        rankA: 1,
        poolBId: pools[1]?.id ?? pools[0]?.id ?? "",
        rankB: 1,
      },
    ]);
  }

  function updateRule(id: string, patch: Partial<SemifinalRule>) {
    onRulesChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRule(id: string) {
    onRulesChange(rules.filter((r) => r.id !== id));
  }

  function resolvedTeamName(poolId: string, rank: number): string {
    const row = poolStandingsById.get(poolId)?.[rank - 1];
    if (!row) return "Not decided yet";
    return teamNameById.get(row.teamId) ?? "Unknown team";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Semi-final pairing rules</CardTitle>
        <CardDescription>
          For championships with many pools, define exactly who plays who once pool play settles - e.g. "Winner Pool A vs
          Winner Pool B" and "Winner Pool C vs Winner Pool D" - instead of an automatic round robin among every qualifier.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rules.map((rule) => (
          <div key={rule.id} className="space-y-2 rounded-md border border-border p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-40">
                <Label>Round name</Label>
                <Input className="mt-1.5" value={rule.roundName} onChange={(e) => updateRule(rule.id, { roundName: e.target.value })} />
              </div>
              <div className="w-40">
                <Label>Pool</Label>
                <Select value={rule.poolAId} onValueChange={(v) => updateRule(rule.id, { poolAId: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {pools.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-28">
                <Label>Rank</Label>
                <Select value={String(rule.rankA)} onValueChange={(v) => updateRule(rule.id, { rankA: Number(v) })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RANK_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>{n === 1 ? "1st" : n === 2 ? "2nd" : "3rd"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <span className="pb-2 text-sm text-muted">vs</span>
              <div className="w-40">
                <Label>Pool</Label>
                <Select value={rule.poolBId} onValueChange={(v) => updateRule(rule.id, { poolBId: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {pools.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-28">
                <Label>Rank</Label>
                <Select value={String(rule.rankB)} onValueChange={(v) => updateRule(rule.id, { rankB: Number(v) })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RANK_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>{n === 1 ? "1st" : n === 2 ? "2nd" : "3rd"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button size="icon" variant="ghost" onClick={() => removeRule(rule.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            <p className="text-xs text-muted">
              {resolvedTeamName(rule.poolAId, rule.rankA)} vs {resolvedTeamName(rule.poolBId, rule.rankB)}
            </p>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={pools.length === 0} onClick={addRule}>
            <Plus className="h-4 w-4" /> Add pairing rule
          </Button>
          <Button size="sm" disabled={rules.length === 0 || generating} onClick={onGenerate}>
            <ArrowUpRight className="h-4 w-4" /> {generating ? "Generating..." : "Generate fixtures from rules"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface ChampionshipOption {
  id: string;
  name: string;
  level: Level;
}

function PromoteTeamsDialog({ gameId, currentLevel }: { gameId: string; currentLevel: Level | undefined }) {
  const [open, setOpen] = React.useState(false);
  const [targetChampionshipId, setTargetChampionshipId] = React.useState("");
  const [topN, setTopN] = React.useState("1");

  const { data: championshipsData } = useQuery({
    queryKey: ["championships-picker"],
    queryFn: () => apiGet<{ championships: ChampionshipOption[] }>("/api/championships"),
    enabled: open,
  });
  const higherLevelChampionships = (championshipsData?.championships ?? []).filter(
    (c) => currentLevel && isHigherLevel(c.level, currentLevel),
  );

  const promoteMutation = useMutation({
    mutationFn: () =>
      apiPost<{ promoted: Array<{ team: string; created: boolean; rosterCopied: number }> }>("/api/tournament-teams/promote", {
        gameId,
        targetChampionshipId,
        topN: Number(topN),
      }),
    onSuccess: (result) => {
      const createdCount = result.promoted.filter((p) => p.created).length;
      toast.success(
        createdCount > 0
          ? `Promoted ${createdCount} team${createdCount === 1 ? "" : "s"}: ${result.promoted.map((p) => p.team).join(", ")}`
          : "These teams were already promoted to that championship",
      );
      setOpen(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to promote teams"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <ArrowUpRight className="h-4 w-4" /> Promote top teams
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Promote top teams to a higher level</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Target championship</Label>
            <Select value={targetChampionshipId} onValueChange={setTargetChampionshipId}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select a championship" /></SelectTrigger>
              <SelectContent>
                {higherLevelChampionships.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name} ({LEVEL_LABELS[c.level]})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {higherLevelChampionships.length === 0 && (
              <p className="mt-1.5 text-xs text-muted">
                No higher-level championship found that you manage - create one first (e.g. a Zone-level event) before
                promoting.
              </p>
            )}
          </div>
          <div>
            <Label>How many teams to promote</Label>
            <Select value={topN} onValueChange={setTopN}>
              <SelectTrigger className="mt-1.5 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((n) => (
                  <SelectItem key={n} value={String(n)}>Top {n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted">
            A matching game (same category, gender, school level, and sport) must already exist in the target
            championship. Rosters are copied as an editable starting point - JS/Senior School/Tertiary teams are
            renamed &quot;{"{"}this championship&apos;s name{"}"} - {"{"}team name{"}"}&quot;; Primary teams keep just their own name.
          </p>
          <Button className="w-full" disabled={!targetChampionshipId || promoteMutation.isPending} onClick={() => promoteMutation.mutate()}>
            {promoteMutation.isPending ? "Promoting..." : "Promote teams"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FixturesPanel({ championshipId, championshipName }: { championshipId: string; championshipName: string }) {
  const queryClient = useQueryClient();
  const [gameId, setGameId] = React.useState<string>("");
  const [gameSearch, setGameSearch] = React.useState("");
  const [newPoolName, setNewPoolName] = React.useState("");
  const [topPerPool, setTopPerPool] = React.useState("1");

  const { data: championshipData } = useQuery({
    queryKey: ["championship", championshipId],
    queryFn: () =>
      apiGet<{ championship: { startDate: string; endDate: string; level: Level } }>(`/api/championships/${championshipId}`),
  });
  const championshipStart = championshipData?.championship.startDate.slice(0, 10);
  const championshipEnd = championshipData?.championship.endDate.slice(0, 10);
  const isMultiDay = !!championshipStart && !!championshipEnd && championshipStart !== championshipEnd;
  const championshipLevel = championshipData?.championship.level;

  const { data: gamesData } = useQuery({
    queryKey: ["games", championshipId],
    queryFn: () => apiGet<{ games: GameOption[] }>(`/api/games?championshipId=${championshipId}`),
  });
  const fixtureGames = (gamesData?.games ?? []).filter((g) => !g.isTimed);
  const searchedGames = gameSearch.trim()
    ? fixtureGames.filter((g) => g.name.toLowerCase().includes(gameSearch.trim().toLowerCase()))
    : fixtureGames;
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

  const poolStandingsById = React.useMemo(() => {
    const map = new Map<string, StandingRow[]>();
    if (!selectedGame?.sport) return map;
    for (const pool of pools) {
      const poolTeamIds = teams.filter((t) => t.poolId === pool.id).map((t) => t.id);
      const { results, walkovers } = toStandingsInputs(fixtures.filter((f) => f.poolId === pool.id));
      map.set(pool.id, computeStandings(poolTeamIds, results, selectedGame.sport as BallSport, walkovers));
    }
    return map;
  }, [pools, teams, fixtures, selectedGame]);

  const [semifinalRules, setSemifinalRules] = React.useState<SemifinalRule[]>([]);
  const generateFromRulesMutation = useMutation({
    mutationFn: async () => {
      const existingPairs = new Set(fixtures.map((f) => [f.teamAId, f.teamBId].sort().join("::")));
      let created = 0;
      let skipped = 0;
      for (const rule of semifinalRules) {
        const teamA = poolStandingsById.get(rule.poolAId)?.[rule.rankA - 1];
        const teamB = poolStandingsById.get(rule.poolBId)?.[rule.rankB - 1];
        if (!teamA || !teamB || teamA.teamId === teamB.teamId) {
          skipped++;
          continue;
        }
        const pairKey = [teamA.teamId, teamB.teamId].sort().join("::");
        if (existingPairs.has(pairKey)) {
          skipped++;
          continue;
        }
        await apiPost("/api/match-pools", {
          gameId,
          poolId: null,
          roundName: rule.roundName,
          teamAId: teamA.teamId,
          teamBId: teamB.teamId,
          matchDate: null,
        });
        existingPairs.add(pairKey);
        created++;
      }
      return { created, skipped };
    },
    onSuccess: ({ created, skipped }) => {
      toast.success(
        created > 0
          ? `Created ${created} fixture${created === 1 ? "" : "s"} from rules${skipped > 0 ? ` (${skipped} skipped - pool not decided yet or already exists)` : ""}`
          : "No new fixtures - pool standings aren't final yet, or these matches already exist",
      );
      refetchAll();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to generate fixtures from rules"),
  });

  const [roundToAdvance, setRoundToAdvance] = React.useState("");
  const advanceRoundMutation = useMutation({
    mutationFn: (roundName: string) => apiPost<{ created: number; roundName: string }>("/api/match-pools/advance-round", { gameId, roundName }),
    onSuccess: (result) => {
      toast.success(
        result.created > 0
          ? `${result.created} ${result.roundName} fixture${result.created === 1 ? "" : "s"} created from the winners`
          : `${result.roundName} fixtures already exist for these winners`,
      );
      setRoundToAdvance("");
      refetchAll();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to advance winners"),
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
    const { results, walkovers } = toStandingsInputs(
      fixtures.filter((f) => teamIdSet.has(f.teamAId) && teamIdSet.has(f.teamBId)),
    );
    return computeStandings(teamIds, results, selectedGame.sport, walkovers);
  }

  const unpooledTeams = teams.filter((t) => !t.poolId);
  // "Unassigned" bucket: fixtures with no pool - either manual knockout
  // pairings (semis/final crossing pools) or, when no pools exist at all,
  // every fixture for the game.
  const unassignedFixtures = fixtures.filter((f) => f.poolId === null);
  // Every knockout round with more than one match, annotated with why it
  // can or can't be advanced yet - a round with a single tied/undecided
  // match should say so rather than just silently not appearing anywhere.
  const roundStatuses = Array.from(new Set(unassignedFixtures.map((f) => f.roundName)))
    .map((roundName) => {
      const roundFixtures = unassignedFixtures.filter((f) => f.roundName === roundName);
      const undecided = roundFixtures.filter((f) => f.winnerId === null);
      const tied = undecided.filter((f) => f.teamAScore !== null && f.teamBScore !== null);
      return { roundName, matchCount: roundFixtures.length, undecidedCount: undecided.length, tiedCount: tied.length };
    })
    .filter((r) => r.matchCount >= 2);
  const advanceableRounds = roundStatuses.filter((r) => r.undecidedCount === 0).map((r) => r.roundName);
  const blockedRounds = roundStatuses.filter((r) => r.undecidedCount > 0);

  // Combined standings across every team in the game - shown when no pools
  // have been created yet (preserves the original simple flat-pool workflow).
  const combinedStandings = standingsFor(teams.map((t) => t.id));

  const shareUrl =
    typeof window !== "undefined"
      ? selectedGame
        ? `${window.location.origin}/game/${selectedGame.id}`
        : `${window.location.origin}/championship/${championshipId}`
      : "";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Fixtures &amp; Pooling</CardTitle>
            <CardDescription>Select a ball game/team event to manage its pools, fixtures, scores, and live standings.</CardDescription>
          </div>
          <div className="no-print flex flex-wrap items-center gap-2">
            {gameId && <PromoteTeamsDialog gameId={gameId} currentLevel={championshipLevel} />}
            <PrintButton />
            <ShareButton
              title={selectedGame ? selectedGame.name : championshipName}
              message={buildResultsShareMessage(selectedGame ? selectedGame.name : championshipName, shareUrl)}
              url={shareUrl}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-56">
              <Label htmlFor="fixtures-game-search">Search game</Label>
              <Input
                id="fixtures-game-search"
                className="mt-1.5"
                placeholder="Type to filter..."
                value={gameSearch}
                onChange={(e) => setGameSearch(e.target.value)}
              />
            </div>
            <div className="w-64">
              <Label>Game</Label>
              <Select value={gameId} onValueChange={setGameId}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select a game" /></SelectTrigger>
                <SelectContent>
                  {searchedGames.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                  {searchedGames.length === 0 && (
                    <p className="px-2 py-1.5 text-sm text-muted">No games match &quot;{gameSearch}&quot;.</p>
                  )}
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

      {gameId && pools.length >= 2 && (
        <SemifinalRulesCard
          pools={pools}
          poolStandingsById={poolStandingsById}
          teamNameById={teamNameById}
          rules={semifinalRules}
          onRulesChange={setSemifinalRules}
          onGenerate={() => generateFromRulesMutation.mutate()}
          generating={generateFromRulesMutation.isPending}
        />
      )}

      {gameId && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{pools.length > 0 ? "Knockout Stage" : "Fixtures"}</CardTitle>
              <CardDescription>
                {pools.length > 0
                  ? "Teams progress from pool play automatically - or pair them manually for extra playoffs."
                  : "Add fixtures manually, or generate a full round robin below."}
                {" "}Once every match in a round has a winner, use "Advance winners" to auto-create the next round's pairings.
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
              {advanceableRounds.length > 0 && (
                <>
                  <Select value={roundToAdvance} onValueChange={setRoundToAdvance}>
                    <SelectTrigger className="w-48"><SelectValue placeholder="Advance which round?" /></SelectTrigger>
                    <SelectContent>
                      {advanceableRounds.map((roundName) => (
                        <SelectItem key={roundName} value={roundName}>{roundName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={!roundToAdvance || advanceRoundMutation.isPending}
                    onClick={() => advanceRoundMutation.mutate(roundToAdvance)}
                  >
                    <ArrowUpRight className="h-4 w-4" /> {advanceRoundMutation.isPending ? "Advancing..." : "Advance winners"}
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
            {blockedRounds.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700">
                {blockedRounds.map((r) => (
                  <p key={r.roundName}>
                    <span className="font-medium">{r.roundName}</span> can&apos;t advance yet -{" "}
                    {r.tiedCount > 0
                      ? `${r.tiedCount} match${r.tiedCount === 1 ? "" : "es"} ended in a tie and need${r.tiedCount === 1 ? "s" : ""} a decisive score (e.g. penalties) before winners can be determined.`
                      : `${r.undecidedCount} match${r.undecidedCount === 1 ? "" : "es"} still ${r.undecidedCount === 1 ? "hasn't" : "haven't"} had a score entered.`}
                  </p>
                ))}
              </div>
            )}
            {fixturesLoading && <p className="text-muted">Loading fixtures...</p>}
            {!fixturesLoading && (
              <FixturesTable
                fixtures={unassignedFixtures}
                onChanged={refetchAll}
                emptyMessage={
                  pools.length > 0
                    ? "No knockout fixtures yet. Once pool standings show who's progressing, add the semi-final/final pairings here. They'll be visible to the public right away, even before scores are entered."
                    : "No fixtures yet. Add one manually or generate a round robin above - fixtures are visible to the public as soon as they're added, even before scores are entered, so schedule them ahead of match day."
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
