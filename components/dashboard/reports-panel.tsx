"use client";

import * as React from "react";
import { toast } from "sonner";
import { FileDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShareButton } from "@/components/ui/share-button";
import { apiGet } from "@/lib/api-client";
import { GAME_SCHOOL_LEVELS } from "@/lib/school-levels";
import { addPdfLogoHeader, addPdfFooter, addPdfTitle } from "@/lib/pdf-logo";
import { buildResultsShareMessage } from "@/lib/share-message";
import {
  downloadOrganizationRankingsPdf,
  type OrganizationRankingPdfRow,
  type GameOrganizationRankingPdfSection,
} from "@/lib/export-organization-rankings-pdf";
import { downloadJsGameWinnersPdf } from "@/lib/export-js-game-winners-pdf";

interface RankingRow {
  position: number;
  schoolName: string;
  boysTotal: number;
  girlsTotal: number;
  grandTotal: number;
}

interface TeamStandingRow {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

interface PoolStandings {
  poolId: string;
  poolName: string;
  standings: TeamStandingRow[];
}

interface GameStandings {
  gameId: string;
  gameName: string;
  gender: string;
  sport: string;
  standings: TeamStandingRow[];
  pools: PoolStandings[];
}

const SCHOOL_LEVEL_FILTERS = [{ value: "OVERALL", label: "Overall" }, ...GAME_SCHOOL_LEVELS];
const GENDER_FILTERS = [
  { value: "OVERALL", label: "Overall" },
  { value: "BOYS", label: "Boys" },
  { value: "GIRLS", label: "Girls" },
];

export function ReportsPanel({ championshipId, championshipName }: { championshipId: string; championshipName: string }) {
  const [schoolLevel, setSchoolLevel] = React.useState("OVERALL");
  const [gender, setGender] = React.useState("OVERALL");
  const [exporting, setExporting] = React.useState(false);
  const [printing, setPrinting] = React.useState(false);
  const [exportingRankings, setExportingRankings] = React.useState(false);
  const [exportingJsWinners, setExportingJsWinners] = React.useState(false);

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/championship/${championshipId}` : "";

  function filterLabel(): string {
    const genderLabel = GENDER_FILTERS.find((g) => g.value === gender)?.label ?? "Overall";
    const schoolLevelLabel = SCHOOL_LEVEL_FILTERS.find((l) => l.value === schoolLevel)?.label ?? "Overall";
    return gender === "OVERALL" && schoolLevel === "OVERALL" ? "Overall" : `${genderLabel} - ${schoolLevelLabel}`;
  }

  /** Builds the final-standings PDF - shared by the download and print buttons so print prints exactly what would be downloaded. */
  async function buildStandingsDoc() {
    const { standings, teamStandings } = await apiGet<{ standings: RankingRow[]; teamStandings: GameStandings[] }>(
      `/api/rankings?championshipId=${championshipId}&schoolLevel=${schoolLevel}&gender=${gender}`,
    );

    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    const contentY = await addPdfLogoHeader(doc);
    const titleEndY = addPdfTitle(doc, `${championshipName} - Official Standings (${filterLabel()})`, contentY + 6);

    // Athletics events produce Participant.position rows (the `standings`
    // table); ball-games/indoor-games team fixtures don't - those results
    // live in `teamStandings` (one table per game) instead. Export whichever
    // is populated, mirroring the branch the on-screen panel uses.
    let nextY = titleEndY + 6;
    if (standings.length > 0) {
      autoTable(doc, {
        startY: nextY,
        head: [["Position", "Institution", "Boys Total", "Girls Total", "Grand Total"]],
        body: standings.map((row) => [row.position, row.schoolName, row.boysTotal, row.girlsTotal, row.grandTotal]),
      });
    } else if (teamStandings.length > 0) {
      for (const game of teamStandings) {
        const gameTitleEndY = addPdfTitle(doc, game.gameName, nextY, 11);
        nextY = gameTitleEndY;
        const pools = (game.pools.length > 0 ? game.pools : [{ poolId: game.gameId, poolName: "Pool", standings: game.standings }]).filter(
          (pool) => pool.standings.length > 0,
        );
        for (const pool of pools) {
          const poolTitleEndY = addPdfTitle(doc, pool.poolName, nextY, 9);
          autoTable(doc, {
            startY: poolTitleEndY,
            head: [["#", "Team", "P", "W", "D", "L", "GF", "GA", "GD", "Pts"]],
            body: pool.standings.map((row, index) => [
              index + 1,
              row.teamName,
              row.played,
              row.won,
              row.drawn,
              row.lost,
              row.gf,
              row.ga,
              row.gd,
              row.points,
            ]),
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          nextY = (doc as any).lastAutoTable.finalY + 8;
        }
        nextY += 2;
      }
    } else {
      autoTable(doc, { startY: nextY, head: [["Institution", "Boys Total", "Girls Total", "Grand Total"]], body: [] });
    }
    addPdfFooter(doc);
    const filterSlug = filterLabel().replace(/\s+/g, "-").toLowerCase();
    const filename = `${championshipName.replace(/\s+/g, "-").toLowerCase()}-standings-${filterSlug}.pdf`;
    return { doc, filename };
  }

  async function exportStandings() {
    setExporting(true);
    try {
      const { doc, filename } = await buildStandingsDoc();
      doc.save(filename);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export standings");
    } finally {
      setExporting(false);
    }
  }

  // window.print() on this panel prints a blank page - there's no on-screen
  // standings table here, just filter controls. Instead build the same PDF
  // the download button produces, flag it to auto-open the print dialog, and
  // hand it to the browser's own PDF viewer in a new tab.
  async function printStandings() {
    setPrinting(true);
    try {
      const { doc } = await buildStandingsDoc();
      doc.autoPrint();
      window.open(doc.output("bloburl"), "_blank");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to prepare standings for printing");
    } finally {
      setPrinting(false);
    }
  }

  async function exportOrganizationRankings() {
    setExportingRankings(true);
    try {
      const { organizationRankings, organizationRankingsByGame } = await apiGet<{
        organizationRankings: OrganizationRankingPdfRow[];
        organizationRankingsByGame: Array<{ gameName: string; rankings: OrganizationRankingPdfRow[] }>;
      }>(`/api/rankings?championshipId=${championshipId}&schoolLevel=${schoolLevel}&gender=${gender}`);
      const byGame: GameOrganizationRankingPdfSection[] = organizationRankingsByGame.map((game) => ({
        gameName: game.gameName,
        rankings: game.rankings,
      }));
      await downloadOrganizationRankingsPdf(championshipName, organizationRankings, filterLabel(), byGame);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export rankings");
    } finally {
      setExportingRankings(false);
    }
  }

  async function exportJsGameWinners() {
    setExportingJsWinners(true);
    try {
      const { teamStandings } = await apiGet<{ teamStandings: GameStandings[] }>(
        `/api/rankings?championshipId=${championshipId}&schoolLevel=JS`,
      );
      const rows = teamStandings
        .filter((game) => game.standings.length > 0)
        .map((game) => ({
          gameName: game.gameName,
          sport: game.sport,
          gender: game.gender,
          winningTeam: game.standings[0]!.teamName,
        }));
      if (rows.length === 0) {
        toast.error("No JS ball games with results yet");
        return;
      }
      await downloadJsGameWinnersPdf(championshipName, rows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export JS game winners");
    } finally {
      setExportingJsWinners(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Reports</CardTitle>
          <CardDescription>Printable, official-format exports of championship results.</CardDescription>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={printStandings} disabled={printing}>
            <Printer className="h-4 w-4" /> {printing ? "Preparing..." : "Print"}
          </Button>
          <ShareButton
            title={championshipName}
            message={buildResultsShareMessage(championshipName, publicUrl)}
            url={publicUrl}
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div>
          <Select value={gender} onValueChange={setGender}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {GENDER_FILTERS.map((g) => (
                <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Select value={schoolLevel} onValueChange={setSchoolLevel}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SCHOOL_LEVEL_FILTERS.map((level) => (
                <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={exportStandings} disabled={exporting}>
          <FileDown className="h-4 w-4" /> {exporting ? "Exporting..." : "Export final standings (PDF)"}
        </Button>
        <Button variant="secondary" onClick={exportOrganizationRankings} disabled={exportingRankings}>
          <FileDown className="h-4 w-4" /> {exportingRankings ? "Exporting..." : "Export organization rankings (PDF)"}
        </Button>
        <Button variant="secondary" onClick={exportJsGameWinners} disabled={exportingJsWinners}>
          <FileDown className="h-4 w-4" /> {exportingJsWinners ? "Exporting..." : "Download JS ball games winners (PDF)"}
        </Button>
      </CardContent>
    </Card>
  );
}
