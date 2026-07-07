"use client";

import * as React from "react";
import { toast } from "sonner";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PrintButton } from "@/components/ui/print-button";
import { ShareButton } from "@/components/ui/share-button";
import { apiGet } from "@/lib/api-client";
import { GAME_SCHOOL_LEVELS } from "@/lib/school-levels";
import { addPdfLogoHeader, addPdfFooter } from "@/lib/pdf-logo";
import { buildResultsShareMessage } from "@/lib/share-message";
import { downloadOrganizationRankingsPdf, type OrganizationRankingPdfRow } from "@/lib/export-organization-rankings-pdf";

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
  points: number;
}

interface GameStandings {
  gameId: string;
  gameName: string;
  standings: TeamStandingRow[];
}

const SCHOOL_LEVEL_FILTERS = [{ value: "OVERALL", label: "Overall" }, ...GAME_SCHOOL_LEVELS];

export function ReportsPanel({ championshipId, championshipName }: { championshipId: string; championshipName: string }) {
  const [schoolLevel, setSchoolLevel] = React.useState("OVERALL");
  const [exporting, setExporting] = React.useState(false);
  const [exportingRankings, setExportingRankings] = React.useState(false);

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/championship/${championshipId}` : "";

  async function exportStandings() {
    setExporting(true);
    try {
      const { standings, teamStandings } = await apiGet<{ standings: RankingRow[]; teamStandings: GameStandings[] }>(
        `/api/rankings?championshipId=${championshipId}&schoolLevel=${schoolLevel}`,
      );

      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF();
      const contentY = await addPdfLogoHeader(doc);
      doc.setFontSize(14);
      doc.text(`${championshipName} - Official Standings (${schoolLevel.replace("_", " ")})`, 14, contentY + 6);

      // Athletics events produce Participant.position rows (the `standings`
      // table); ball-games/indoor-games team fixtures don't - those results
      // live in `teamStandings` (one table per game) instead. Export whichever
      // is populated, mirroring the branch the on-screen panel uses.
      let nextY = contentY + 12;
      if (standings.length > 0) {
        autoTable(doc, {
          startY: nextY,
          head: [["Position", "Institution", "Boys Total", "Girls Total", "Grand Total"]],
          body: standings.map((row) => [row.position, row.schoolName, row.boysTotal, row.girlsTotal, row.grandTotal]),
        });
      } else if (teamStandings.length > 0) {
        for (const game of teamStandings) {
          doc.setFontSize(11);
          doc.text(game.gameName, 14, nextY);
          autoTable(doc, {
            startY: nextY + 4,
            head: [["#", "Team", "P", "W", "D", "L", "Pts"]],
            body: game.standings.map((row, index) => [
              index + 1,
              row.teamName,
              row.played,
              row.won,
              row.drawn,
              row.lost,
              row.points,
            ]),
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          nextY = (doc as any).lastAutoTable.finalY + 10;
        }
      } else {
        autoTable(doc, { startY: nextY, head: [["Institution", "Boys Total", "Girls Total", "Grand Total"]], body: [] });
      }
      addPdfFooter(doc);
      doc.save(`${championshipName.replace(/\s+/g, "-").toLowerCase()}-standings.pdf`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export standings");
    } finally {
      setExporting(false);
    }
  }

  async function exportOrganizationRankings() {
    setExportingRankings(true);
    try {
      const { organizationRankings } = await apiGet<{ organizationRankings: OrganizationRankingPdfRow[] }>(
        `/api/rankings?championshipId=${championshipId}&schoolLevel=${schoolLevel}&gender=OVERALL`,
      );
      const filterLabel = schoolLevel === "OVERALL" ? "Overall" : schoolLevel.replace("_", " ");
      await downloadOrganizationRankingsPdf(championshipName, organizationRankings, filterLabel);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export rankings");
    } finally {
      setExportingRankings(false);
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
          <PrintButton />
          <ShareButton
            title={championshipName}
            message={buildResultsShareMessage(championshipName, publicUrl)}
            url={publicUrl}
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
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
      </CardContent>
    </Card>
  );
}
