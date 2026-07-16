"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PanelErrorBoundary } from "@/components/error-boundary";
import { GamesPanel } from "@/components/dashboard/games-panel";
import { ParticipantsPanel } from "@/components/dashboard/participants-panel";
import { TeamsPanel } from "@/components/dashboard/teams-panel";
import { FixturesPanel } from "@/components/dashboard/fixtures-panel";
import { CallRoomPanel } from "@/components/dashboard/call-room-panel";
import { BibRangesPanel } from "@/components/dashboard/bib-ranges-panel";
import { ReportsPanel } from "@/components/dashboard/reports-panel";
import { AnalyticsPanel } from "@/components/dashboard/analytics-panel";
import { ChampionshipSettingsPanel } from "@/components/dashboard/championship-settings-panel";
import { CircularsPanel } from "@/components/dashboard/circulars-panel";
import { apiPatch } from "@/lib/api-client";
import { useSetAppShellLabel } from "@/components/app-shell-context";

export function ChampionshipManager({
  championshipId,
  name,
  category,
  schoolLevel,
  isPublished,
  restrictToOrganizationName,
  isSuperAdmin,
}: {
  championshipId: string;
  name: string;
  category: string;
  schoolLevel: string;
  isPublished: boolean;
  /** Set when the viewer is a Team Manager - shows only their own organization's teams, nothing else. */
  restrictToOrganizationName?: string | null;
  isSuperAdmin?: boolean;
}) {
  const router = useRouter();
  const [publishing, setPublishing] = React.useState(false);
  useSetAppShellLabel(name);

  // Participant rows (individual competitors) only ever get created for
  // ATHLETICS/MUSIC games; ball-games/indoor-games (BALL_GAMES, OTHER_GAMES)
  // run entirely on TournamentTeam + MatchPool fixtures instead - see
  // lib/team-standings.ts. Hiding the tab that doesn't apply avoids admins
  // registering data in the wrong place for this championship's category.
  const showsParticipants = category === "ATHLETICS" || category === "MUSIC";
  const showsTeams = category === "BALL_GAMES" || category === "OTHER_GAMES";

  async function togglePublish() {
    setPublishing(true);
    try {
      await apiPatch(`/api/championships/${championshipId}`, { isPublished: !isPublished });
      toast.success(isPublished ? "Championship unpublished" : "Championship published");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update");
    } finally {
      setPublishing(false);
    }
  }

  if (restrictToOrganizationName) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{name}</h1>
          <p className="text-muted">Managing {restrictToOrganizationName}&apos;s team registrations only.</p>
        </div>
        <PanelErrorBoundary fallbackTitle="Teams panel failed to load">
          <TeamsPanel
            championshipId={championshipId}
            championshipName={name}
            restrictToOrganizationName={restrictToOrganizationName}
          />
        </PanelErrorBoundary>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">{name}</h1>
          <Badge variant={isPublished ? "success" : "outline"}>{isPublished ? "Published" : "Draft"}</Badge>
        </div>
        <Button variant={isPublished ? "outline" : "default"} onClick={togglePublish} disabled={publishing}>
          {publishing ? "Saving..." : isPublished ? "Unpublish" : "Publish"}
        </Button>
      </div>

      <Tabs defaultValue="games">
        <TabsList className="flex-wrap">
          <TabsTrigger value="games">Games</TabsTrigger>
          {showsParticipants && <TabsTrigger value="participants">Participants</TabsTrigger>}
          {showsTeams && <TabsTrigger value="teams">Teams</TabsTrigger>}
          <TabsTrigger value="fixtures">Fixtures</TabsTrigger>
          <TabsTrigger value="call-room">Call Room</TabsTrigger>
          <TabsTrigger value="bib-ranges">Bib Ranges</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="circulars">Circulars</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="games">
          <PanelErrorBoundary fallbackTitle="Games panel failed to load">
            <GamesPanel championshipId={championshipId} category={category} championshipSchoolLevel={schoolLevel} />
          </PanelErrorBoundary>
        </TabsContent>

        {showsParticipants && (
          <TabsContent value="participants">
            <PanelErrorBoundary fallbackTitle="Participants panel failed to load">
              <ParticipantsPanel championshipId={championshipId} />
            </PanelErrorBoundary>
          </TabsContent>
        )}

        {showsTeams && (
          <TabsContent value="teams">
            <PanelErrorBoundary fallbackTitle="Teams panel failed to load">
              <TeamsPanel championshipId={championshipId} championshipName={name} />
            </PanelErrorBoundary>
          </TabsContent>
        )}

        <TabsContent value="fixtures">
          <PanelErrorBoundary fallbackTitle="Fixtures panel failed to load">
            <FixturesPanel championshipId={championshipId} championshipName={name} />
          </PanelErrorBoundary>
        </TabsContent>

        <TabsContent value="call-room">
          <PanelErrorBoundary fallbackTitle="Call room failed to load">
            <CallRoomPanel championshipId={championshipId} />
          </PanelErrorBoundary>
        </TabsContent>

        <TabsContent value="bib-ranges">
          <PanelErrorBoundary fallbackTitle="Bib ranges panel failed to load">
            <BibRangesPanel championshipId={championshipId} championshipName={name} />
          </PanelErrorBoundary>
        </TabsContent>

        <TabsContent value="reports">
          <PanelErrorBoundary fallbackTitle="Reports panel failed to load">
            <ReportsPanel championshipId={championshipId} championshipName={name} />
          </PanelErrorBoundary>
        </TabsContent>

        <TabsContent value="analytics">
          <PanelErrorBoundary fallbackTitle="Analytics panel failed to load">
            <AnalyticsPanel championshipId={championshipId} />
          </PanelErrorBoundary>
        </TabsContent>

        <TabsContent value="circulars">
          <PanelErrorBoundary fallbackTitle="Circulars panel failed to load">
            <CircularsPanel championshipId={championshipId} />
          </PanelErrorBoundary>
        </TabsContent>

        <TabsContent value="settings">
          <PanelErrorBoundary fallbackTitle="Settings panel failed to load">
            <ChampionshipSettingsPanel championshipId={championshipId} isSuperAdmin={isSuperAdmin} />
          </PanelErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
