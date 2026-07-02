"use client";

import * as React from "react";
import { toast } from "sonner";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet } from "@/lib/api-client";
import { GAME_SCHOOL_LEVELS } from "@/lib/school-levels";
import { addPdfLogoHeader } from "@/lib/pdf-logo";

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reports</CardTitle>
        <CardDescription>Printable, official-format exports of championship results.</CardDescription>
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
      </CardContent>
    </Card>
  );
}
