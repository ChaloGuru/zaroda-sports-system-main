"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PanelErrorBoundary } from "@/components/error-boundary";
import { TrackResultsPanel, isTrackResultsGame } from "@/components/dashboard/track-results-panel";
import { FieldResultsPanel } from "@/components/dashboard/field-results-panel";
import { FixturesPanel } from "@/components/dashboard/fixtures-panel";
import { apiGet } from "@/lib/api-client";
import { isFieldEvent } from "@/lib/field-events";

interface GameOption {
  id: string;
  name: string;
  category: string;
  sport: string | null;
  isTimed: boolean;
}

type ResultsTab = "track" | "field" | "ball-games" | "scored";

// Which results sheet each discipline official works from - they land on it
// when they open Results.
const ROLE_HOME_TAB: Record<string, ResultsTab> = {
  CHIEF_TRACK_JUDGE: "track",
  CHIEF_FIELD_JUDGE: "field",
  GAME_COORDINATOR: "ball-games",
};

/**
 * One Results tab for a championship that mixes the three result formats a
 * school athletics championship needs: timed races (Chief Track Judge),
 * measured jumps/throws (Chief Field Judge) and ball-game match scores
 * (Game Coordinator). Each sub-tab only appears when the championship has
 * active games of that kind.
 */
export function ResultsPanel({ championshipId, championshipName }: { championshipId: string; championshipName: string }) {
  const { data: session } = useSession();
  const { data: gamesData } = useQuery({
    queryKey: ["games", championshipId],
    queryFn: () => apiGet<{ games: GameOption[] }>(`/api/games?championshipId=${championshipId}`),
  });
  const games = gamesData?.games ?? [];

  const available: Record<ResultsTab, boolean> = {
    track: games.some((g) => isTrackResultsGame(g, "track")),
    field: games.some(isFieldEvent),
    "ball-games": games.some((g) => g.category === "BALL_GAMES" || g.category === "OTHER_GAMES"),
    scored: games.some((g) => isTrackResultsGame(g, "scored")),
  };
  const tabs = (Object.keys(available) as ResultsTab[]).filter((t) => available[t]);

  const roleTab = (session?.user?.roles ?? [])
    .filter((r) => r.championshipId === championshipId)
    .map((r) => ROLE_HOME_TAB[r.role])
    .find((t): t is ResultsTab => !!t && available[t]);

  const [tab, setTab] = React.useState<ResultsTab | null>(null);
  const activeTab = tab && available[tab] ? tab : (roleTab ?? tabs[0]);

  if (!gamesData) return <p className="text-muted">Loading...</p>;
  if (!activeTab) return <p className="text-muted">Add games to this championship to start entering results.</p>;

  return (
    <Tabs value={activeTab} onValueChange={(v) => setTab(v as ResultsTab)}>
      <TabsList className="flex-wrap">
        {available.track && <TabsTrigger value="track">Track events</TabsTrigger>}
        {available.field && <TabsTrigger value="field">Field events</TabsTrigger>}
        {available["ball-games"] && <TabsTrigger value="ball-games">Ball games</TabsTrigger>}
        {available.scored && <TabsTrigger value="scored">Scored events</TabsTrigger>}
      </TabsList>

      {available.track && (
        <TabsContent value="track">
          <PanelErrorBoundary fallbackTitle="Track results failed to load">
            <TrackResultsPanel championshipId={championshipId} mode="track" />
          </PanelErrorBoundary>
        </TabsContent>
      )}
      {available.field && (
        <TabsContent value="field">
          <PanelErrorBoundary fallbackTitle="Field results failed to load">
            <FieldResultsPanel championshipId={championshipId} />
          </PanelErrorBoundary>
        </TabsContent>
      )}
      {available["ball-games"] && (
        <TabsContent value="ball-games" className="space-y-3">
          <p className="text-sm text-muted">
            Game Coordinator: enter each match&apos;s score below - standings, pool winners and knockout progression
            update from these results.
          </p>
          <PanelErrorBoundary fallbackTitle="Ball game results failed to load">
            <FixturesPanel championshipId={championshipId} championshipName={championshipName} />
          </PanelErrorBoundary>
        </TabsContent>
      )}
      {available.scored && (
        <TabsContent value="scored">
          <PanelErrorBoundary fallbackTitle="Scored events failed to load">
            <TrackResultsPanel championshipId={championshipId} mode="scored" />
          </PanelErrorBoundary>
        </TabsContent>
      )}
    </Tabs>
  );
}
