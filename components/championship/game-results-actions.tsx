"use client";

import * as React from "react";
import { toast } from "sonner";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/ui/print-button";
import { ShareButton } from "@/components/ui/share-button";
import { buildResultsShareMessage } from "@/lib/share-message";
import { downloadGameStandingsPdf, type GameStandingsPdfRow } from "@/lib/export-game-standings-pdf";

/** Print / download / share toolbar for a single game's score/standings page. */
export function GameResultsActions({
  gameId,
  gameName,
  championshipName,
  standings,
}: {
  gameId: string;
  gameName: string;
  championshipName: string;
  /** Omitted for timed/individual events, which have results rather than team standings. */
  standings?: GameStandingsPdfRow[];
}) {
  const [downloading, setDownloading] = React.useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/game/${gameId}` : "";

  async function download() {
    if (!standings) return;
    setDownloading(true);
    try {
      await downloadGameStandingsPdf(championshipName, gameName, standings);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download standings");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <PrintButton />
      {standings && (
        <Button variant="outline" size="sm" onClick={download} disabled={downloading || standings.length === 0}>
          <FileDown className="h-4 w-4" /> {downloading ? "Downloading..." : "Download PDF"}
        </Button>
      )}
      <ShareButton title={gameName} message={buildResultsShareMessage(gameName, url)} url={url} />
    </div>
  );
}
