"use client";

import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StandingsPanel } from "@/components/championship/standings-panel";

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

export function ChampionshipTabs({
  championshipId,
  games,
  teams,
}: {
  championshipId: string;
  games: GameSummary[];
  teams: TeamSummary[];
}) {
  return (
    <Tabs defaultValue="games" className="mt-8">
      <TabsList>
        <TabsTrigger value="games">Games</TabsTrigger>
        <TabsTrigger value="standings">Standings</TabsTrigger>
        <TabsTrigger value="teams">Teams / Schools</TabsTrigger>
      </TabsList>

      <TabsContent value="games">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.length === 0 && <p className="text-muted">No games have been added yet.</p>}
          {games.map((game) => (
            <Link key={game.id} href={`/game/${game.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{game.gender}</Badge>
                    <Badge variant="outline">{game.isTimed ? "Timed" : "Scored"}</Badge>
                  </div>
                  <CardTitle className="mt-2">{game.name}</CardTitle>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="standings">
        <StandingsPanel championshipId={championshipId} />
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
    </Tabs>
  );
}
