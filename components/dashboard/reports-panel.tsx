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
import { addPdfLogoHeader } from "@/lib/pdf-logo";
import { buildResultsShareMessage } from "@/lib/share-message";
import { downloadOrganizationRankingsPdf, type OrganizationRankingPdfRow } from "@/lib/export-organization-rankings-pdf";

interface RankingRow {
  position: number;
  schoolName: string;
  boysTotal: number;
  girlsTotal: number;
  grandTotal: number;
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
      const { standings } = await apiGet<{ standings: RankingRow[] }>(
        `/api/rankings?championshipId=${championshipId}&schoolLevel=${schoolLevel}`,
      );

      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF();
      const contentY = await addPdfLogoHeader(doc);
      doc.setFontSize(14);
      doc.text(`${championshipName} - Official Standings (${schoolLevel.replace("_", " ")})`, 14, contentY + 6);
      autoTable(doc, {
        startY: contentY + 12,
        head: [["Position", "Institution", "Boys Total", "Girls Total", "Grand Total"]],
        body: standings.map((row) => [row.position, row.schoolName, row.boysTotal, row.girlsTotal, row.grandTotal]),
      });
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
        `/api/rankings?championshipId=${championshipId}&schoolLevel=OVERALL&gender=OVERALL`,
      );
      await downloadOrganizationRankingsPdf(championshipName, organizationRankings);
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
