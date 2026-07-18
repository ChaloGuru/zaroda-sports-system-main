"use client";

import Link from "next/link";
import { Megaphone } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GenderBadge } from "@/components/ui/gender-badge";
import { StandingsPanel } from "@/components/championship/standings-panel";
import { ResultsPanel } from "@/components/championship/results-panel";
import { formatDate } from "@/lib/utils";

interface GameSummary {
  id: string;
  name: string;
  category: string;
  gender: string;
  schoolLevel: string;
  isTimed: boolean;
}

interface TeamSummary {
  id: string;
  name: string;
  teamCode: string | null;
}

interface CircularSummary {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  postedByName: string;
}

export function ChampionshipTabs({
  championshipId,
  championshipName,
  games,
  teams,
  circulars,
}: {
  championshipId: string;
  championshipName: string;
  games: GameSummary[];
  teams: TeamSummary[];
  circulars: CircularSummary[];
}) {
  return (
    <Tabs defaultValue="games" className="mt-8">
      <TabsList>
        <TabsTrigger value="games">Games</TabsTrigger>
        <TabsTrigger value="results">Results</TabsTrigger>
        <TabsTrigger value="standings">Standings</TabsTrigger>
        <TabsTrigger value="teams">Teams / Schools</TabsTrigger>
        <TabsTrigger value="circulars">Circulars</TabsTrigger>
      </TabsList>

      <TabsContent value="games">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.length === 0 && <p className="text-muted">No games have been added yet.</p>}
          {games.map((game) => (
            <Link key={game.id} href={`/game/${game.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <GenderBadge gender={game.gender} />
                    <Badge variant="outline">{game.isTimed ? "Timed" : "Scored"}</Badge>
                  </div>
                  <CardTitle className="mt-2">{game.name}</CardTitle>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="results">
        <ResultsPanel championshipId={championshipId} games={games} />
      </TabsContent>

      <TabsContent value="standings">
        <StandingsPanel championshipId={championshipId} championshipName={championshipName} />
      </TabsContent>

      <TabsContent value="teams">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.length === 0 && <p className="text-muted">No teams registered yet.</p>}
          {teams.map((team) => (
            <Card key={team.id}>
              <CardHeader>
                <CardTitle>{team.name}</CardTitle>
                {team.teamCode && <p className="text-sm text-muted">Code: {team.teamCode}</p>}
              </CardHeader>
            </Card>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="circulars">
        <div className="space-y-4">
          {circulars.length === 0 && <p className="text-muted">No circulars posted yet.</p>}
          {circulars.map((c) => (
            <Card key={c.id}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-primary" />
                  <CardTitle>{c.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted">{c.body}</p>
                <p className="mt-3 text-xs text-muted">
                  Posted by {c.postedByName} on {formatDate(c.createdAt)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </TabsContent>
    </Tabs>
  );
}
