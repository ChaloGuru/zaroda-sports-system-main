"use client";

import * as React from "react";
import { toast } from "sonner";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/ui/print-button";
import { ShareButton } from "@/components/ui/share-button";
import { apiGet } from "@/lib/api-client";
import { buildResultsShareMessage } from "@/lib/share-message";
import { downloadOrganizationRankingsPdf, type OrganizationRankingPdfRow } from "@/lib/export-organization-rankings-pdf";

/** Print / download / share toolbar shown on public results-bearing pages. */
export function ResultsActions({ championshipId, championshipName }: { championshipId: string; championshipName: string }) {
  const [downloading, setDownloading] = React.useState(false);

  const url = typeof window !== "undefined" ? `${window.location.origin}/championship/${championshipId}` : "";

  async function download() {
    setDownloading(true);
    try {
      const { organizationRankings } = await apiGet<{ organizationRankings: OrganizationRankingPdfRow[] }>(
        `/api/rankings?championshipId=${championshipId}&schoolLevel=OVERALL&gender=OVERALL`,
      );
      await downloadOrganizationRankingsPdf(championshipName, organizationRankings);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download rankings");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <PrintButton />
      <Button variant="outline" size="sm" onClick={download} disabled={downloading}>
        <FileDown className="h-4 w-4" /> {downloading ? "Downloading..." : "Download PDF"}
      </Button>
      <ShareButton
        title={championshipName}
        message={buildResultsShareMessage(championshipName, url)}
        url={url}
      />
    </div>
  );
}
