import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Scoring Rules | Zaroda Sports Management System",
  description: "How points are awarded across ball games and athletics on Zaroda Sports.",
  alternates: { canonical: "https://zarodasports.live/scoring-rules" },
};

const BALL_GAME_RULES = [
  { sport: "Football", draw: true, win: 3, drawPts: 1, loss: 0 },
  { sport: "Handball", draw: true, win: 2, drawPts: 1, loss: 0 },
  { sport: "Rugby", draw: true, win: 4, drawPts: 2, loss: 0 },
  { sport: "Chess", draw: true, win: 2, drawPts: 1, loss: 0 },
  { sport: "Netball", draw: true, win: 2, drawPts: 1, loss: 0 },
  { sport: "Basketball", draw: false, win: 2, drawPts: null, loss: 1 },
  { sport: "Volleyball", draw: false, win: 3, drawPts: null, loss: 0 },
  { sport: "Table Tennis", draw: false, win: 2, drawPts: null, loss: 0 },
  { sport: "Badminton", draw: false, win: 2, drawPts: null, loss: 0 },
];

const ATHLETICS_POSITION_POINTS = [
  { position: "1st", points: 7 },
  { position: "2nd", points: 5 },
  { position: "3rd", points: 4 },
  { position: "4th", points: 3 },
  { position: "5th", points: 2 },
  { position: "6th", points: 1 },
  { position: "7th and below", points: 0 },
];

export default function ScoringRulesPage() {
  return (
    <div className="container py-16">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Trophy className="h-6 w-6 text-primary" />
        </div>
        <h1 className="mt-4 text-3xl font-bold text-foreground sm:text-4xl">Scoring Rules</h1>
        <p className="mt-3 text-muted">
          How points are awarded across ball games and athletics, and how these feed into the combined Organization
          Rankings leaderboard.
        </p>
      </div>

      <div className="mx-auto mt-10 max-w-3xl space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Ball games &amp; indoor games</CardTitle>
            <CardDescription>Points awarded per match result, used to compute league-style standings.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sport</TableHead>
                  <TableHead>Win</TableHead>
                  <TableHead>Draw</TableHead>
                  <TableHead>Loss</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {BALL_GAME_RULES.map((rule) => (
                  <TableRow key={rule.sport}>
                    <TableCell className="font-medium">{rule.sport}</TableCell>
                    <TableCell className="font-mono tabular-nums">{rule.win}</TableCell>
                    <TableCell className="font-mono tabular-nums">{rule.draw ? rule.drawPts : "Not allowed"}</TableCell>
                    <TableCell className="font-mono tabular-nums">{rule.loss}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-4 text-sm text-muted">
              For sports where a draw isn&apos;t allowed, a tied scoreline is treated as a data-entry edge case - no
              points go to either side. Ties in the standings table are then broken by, in order: head-to-head
              points, goal difference, goals for, and fair play (yellow card -1, red card -3).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Athletics</CardTitle>
            <CardDescription>Points awarded per finishing position in a race or field event.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Position</TableHead>
                  <TableHead>Points</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ATHLETICS_POSITION_POINTS.map((row) => (
                  <TableRow key={row.position}>
                    <TableCell className="font-medium">{row.position}</TableCell>
                    <TableCell className="font-mono tabular-nums">{row.points}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted">
          Both athletics placing points and ball-games win/draw/loss points feed into the same combined{" "}
          <strong className="text-foreground">Organization Rankings</strong> leaderboard, grouped by each
          organization/school&apos;s canonicalized name.
        </p>
      </div>
    </div>
  );
}
