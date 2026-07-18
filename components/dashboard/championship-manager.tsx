"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PanelErrorBoundary } from "@/components/error-boundary";
import { GamesPanel } from "@/components/dashboard/games-panel";
import { ParticipantsPanel } from "@/components/dashboard/participants-panel";
import { TeamsPanel } from "@/components/dashboard/teams-panel";
import { RegisteredTeamsPanel } from "@/components/dashboard/registered-teams-panel";
import { FeesPanel } from "@/components/dashboard/fees-panel";
import { FixturesPanel } from "@/components/dashboard/fixtures-panel";
import { CallRoomPanel } from "@/components/dashboard/call-room-panel";
import { TrackResultsPanel } from "@/components/dashboard/track-results-panel";
import { BibRangesPanel } from "@/components/dashboard/bib-ranges-panel";
import { ReportsPanel } from "@/components/dashboard/reports-panel";
import { AnalyticsPanel } from "@/components/dashboard/analytics-panel";
import { ChampionshipSettingsPanel } from "@/components/dashboard/championship-settings-panel";
import { CircularsPanel } from "@/components/dashboard/circulars-panel";
import { apiPatch, apiGet } from "@/lib/api-client";
import { useSetAppShellLabel } from "@/components/app-shell-context";

export function ChampionshipManager({
  championshipId,
  name,
  category,
  schoolLevel,
  level,
  isPublished,
  restrictToOrganizationName,
  isSuperAdmin,
}: {
  championshipId: string;
  name: string;
  category: string;
  schoolLevel: string;
  /** Championship.level, e.g. "OPEN_TOURNAMENT" - gates the Registered Teams tab and payout-account banner below. */
  level: string;
  isPublished: boolean;
  /** Set when the viewer is a Team Manager - shows only their own organization's teams, nothing else. */
  restrictToOrganizationName?: string | null;
  isSuperAdmin?: boolean;
}) {
  const router = useRouter();
  const [publishing, setPublishing] = React.useState(false);
  useSetAppShellLabel(name);

  const isOpenTournament = level === "OPEN_TOURNAMENT";
  // Only the tenant owner can query/configure a payout account, so a
  // scoped-role viewer (TOURNAMENT_ADMIN, etc.) simply never sees this
  // banner - failing silently rather than erroring the whole page.
  const { data: payoutData } = useQuery({
    queryKey: ["tenant-payout-account"],
    queryFn: () => apiGet<{ payoutAccount: { subaccountStatus: string } }>("/api/tenant/payout-account"),
    enabled: isOpenTournament && !restrictToOrganizationName,
    retry: false,
    throwOnError: false,
  });
  const payoutNotActive = isOpenTournament && payoutData && payoutData.payoutAccount.subaccountStatus !== "ACTIVE";

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

      {payoutNotActive && (
        <div className="flex items-start gap-3 rounded-md border border-[#DA3633]/40 bg-[#DA3633]/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#DA3633]" />
          <div className="text-sm">
            <p className="font-medium text-foreground">Team registration payments are blocked</p>
            <p className="text-muted">
              Set up your bank payout account before opening registration - otherwise team fee payments cannot be
              accepted.{" "}
              <a href="/dashboard/payout-account" className="font-medium text-primary underline">
                Configure payout account
              </a>
            </p>
          </div>
        </div>
      )}

      <Tabs defaultValue="games">
        <TabsList className="flex-wrap">
          <TabsTrigger value="games">Games</TabsTrigger>
          {showsParticipants && <TabsTrigger value="participants">Participants</TabsTrigger>}
          {showsTeams && <TabsTrigger value="teams">Teams</TabsTrigger>}
          {isOpenTournament && <TabsTrigger value="registered-teams">Registered Teams</TabsTrigger>}
          {isOpenTournament && <TabsTrigger value="fees">Fees &amp; Registration</TabsTrigger>}
          <TabsTrigger value="fixtures">Fixtures</TabsTrigger>
          <TabsTrigger value="call-room">Call Room</TabsTrigger>
          {showsParticipants && <TabsTrigger value="track-results">Track Results</TabsTrigger>}
          <TabsTrigger value="bib-ranges">Bib Ranges</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="circulars">Circulars</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="games">
          <PanelErrorBoundary fallbackTitle="Games panel failed to load">
            <GamesPanel
              championshipId={championshipId}
              category={category}
              championshipSchoolLevel={schoolLevel}
              isOpenTournament={isOpenTournament}
            />
          </PanelErrorBoundary>
        </TabsContent>

        {showsParticipants && (
          <TabsContent value="participants">
            <PanelErrorBoundary fallbackTitle="Participants panel failed to load">
              <ParticipantsPanel championshipId={championshipId} isOpenTournament={isOpenTournament} />
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

        {isOpenTournament && (
          <TabsContent value="registered-teams">
            <PanelErrorBoundary fallbackTitle="Registered teams panel failed to load">
              <RegisteredTeamsPanel championshipId={championshipId} />
            </PanelErrorBoundary>
          </TabsContent>
        )}

        {isOpenTournament && (
          <TabsContent value="fees">
            <PanelErrorBoundary fallbackTitle="Fees panel failed to load">
              <FeesPanel championshipId={championshipId} championshipName={name} />
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

        {showsParticipants && (
          <TabsContent value="track-results">
            <PanelErrorBoundary fallbackTitle="Track results panel failed to load">
              <TrackResultsPanel championshipId={championshipId} />
            </PanelErrorBoundary>
          </TabsContent>
        )}

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
