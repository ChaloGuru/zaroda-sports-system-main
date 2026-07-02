import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { GenderBadge } from "@/components/ui/gender-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { LaneChip } from "@/components/ui/lane-chip";
import { prisma } from "@/lib/prisma";
import { formatSecondsToTime, SPORT_CONFIGS } from "@/lib/scoring";
import { resolveTeamNames } from "@/lib/match-pool-teams";
import { computeSingleGameStandings } from "@/lib/team-standings";

export const revalidate = 15;

export default async function GameDetailPage({ params }: { params: { gameId: string } }) {
  const game = await prisma.game.findUnique({
    where: { id: params.gameId },
    include: {
      championship: { select: { id: true, name: true, isPublished: true } },
      participants: {
        orderBy: [{ position: "asc" }, { bibNumber: "asc" }],
        include: { school: { select: { name: true } }, tournamentTeam: { select: { name: true } } },
      },
      heats: {
        orderBy: { heatNumber: "asc" },
        include: {
          participants: {
            orderBy: [{ position: "asc" }, { laneNumber: "asc" }],
            include: { participant: { select: { firstName: true, lastName: true, bibNumber: true } } },
          },
        },
      },
      matchPools: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!game || !game.championship.isPublished) notFound();

  const teamNames = await resolveTeamNames(game.matchPools.flatMap((mp) => [mp.teamAId, mp.teamBId]));
  const standings = await computeSingleGameStandings(game.id);

  return (
    <div className="container py-16">
      <Link href={`/championship/${game.championship.id}`} className="text-sm text-primary hover:underline">
        &larr; {game.championship.name}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <GenderBadge gender={game.gender} />
        <Badge variant="secondary">{game.schoolLevel.replace("_", " ")}</Badge>
        <Badge variant="outline">{game.isTimed ? "Timed event" : "Scored event"}</Badge>
      </div>
      <h1 className="mt-3 text-3xl font-bold text-foreground">{game.name}</h1>

      {game.isTimed ? (
        <div className="mt-8 space-y-8">
          {game.heats.length > 0 ? (
            game.heats.map((heat) => (
              <Card key={heat.id}>
                <CardHeader>
                  <CardTitle>
                    {heat.heatType === "final" ? "Final" : `Heat ${heat.heatNumber}`}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pos</TableHead>
                        <TableHead>Lane</TableHead>
                        <TableHead>Bib</TableHead>
                        <TableHead>Athlete</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Qualified</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {heat.participants.map((hp) => (
                        <TableRow key={hp.id}>
                          <TableCell>
                            {hp.position ? <LaneChip value={hp.position} rank={hp.position} /> : "-"}
                          </TableCell>
                          <TableCell className="font-mono tabular-nums">{hp.laneNumber ?? "-"}</TableCell>
                          <TableCell>
                            <LaneChip value={hp.participant.bibNumber} />
                          </TableCell>
                          <TableCell>
                            {hp.participant.firstName} {hp.participant.lastName}
                          </TableCell>
                          <TableCell className="font-mono tabular-nums">
                            {hp.timeTaken ? formatSecondsToTime(Number(hp.timeTaken)) : "-"}
                          </TableCell>
                          <TableCell>{hp.isQualifiedForFinal ? "Yes" : "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Final Results</CardTitle>
              </CardHeader>
              <CardContent>
                <ResultsTable participants={game.participants} isTimed />
              </CardContent>
            </Card>
          )}
        </div>
      ) : game.matchPools.length > 0 ? (
        <div className="mt-8 space-y-8">
          {standings && standings.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Standings</CardTitle>
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
                      <TableHead>{game.sport ? SPORT_CONFIGS[game.sport].scoreLabel : "Score"} For</TableHead>
                      <TableHead>{game.sport ? SPORT_CONFIGS[game.sport].scoreLabel : "Score"} Against</TableHead>
                      <TableHead>+/-</TableHead>
                      <TableHead>Pts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {standings.map((row, index) => (
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
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Fixtures</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Round</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {game.matchPools.map((mp) => (
                    <TableRow key={mp.id}>
                      <TableCell>{mp.roundName}</TableCell>
                      <TableCell>
                        {teamNames.get(mp.teamAId) ?? "Unknown team"} vs {teamNames.get(mp.teamBId) ?? "Unknown team"}
                      </TableCell>
                      <TableCell className="font-mono tabular-nums">
                        {mp.teamAScore ?? "-"} : {mp.teamBScore ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardContent>
            <ResultsTable participants={game.participants} isTimed={false} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface ParticipantRow {
  id: string;
  firstName: string;
  lastName: string;
  bibNumber: number;
  position: number | null;
  timeTaken: unknown;
  score: unknown;
  school: { name: string } | null;
  tournamentTeam: { name: string } | null;
}

function ResultsTable({ participants, isTimed }: { participants: ParticipantRow[]; isTimed: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Pos</TableHead>
          <TableHead>Bib</TableHead>
          <TableHead>Participant</TableHead>
          <TableHead>Institution</TableHead>
          <TableHead>{isTimed ? "Time" : "Score"}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {participants.map((p) => (
          <TableRow key={p.id}>
            <TableCell>{p.position ? <LaneChip value={p.position} rank={p.position} /> : "-"}</TableCell>
            <TableCell>
              <LaneChip value={p.bibNumber} />
            </TableCell>
            <TableCell>
              {p.firstName} {p.lastName}
            </TableCell>
            <TableCell>{p.school?.name ?? p.tournamentTeam?.name ?? "-"}</TableCell>
            <TableCell className="font-mono tabular-nums">
              {isTimed ? (p.timeTaken ? formatSecondsToTime(Number(p.timeTaken)) : "-") : p.score ? Number(p.score) : "-"}
            </TableCell>
          </TableRow>
        ))}
        {participants.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted">
              No results recorded yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
