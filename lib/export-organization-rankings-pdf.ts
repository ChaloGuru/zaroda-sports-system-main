import type jsPDF from "jspdf";
import { addPdfLogoHeader, addPdfFooter, addPdfTitle } from "./pdf-logo";

export interface OrganizationRankingPdfRow {
  position: number;
  name: string;
  points: number;
}

export interface GameOrganizationRankingPdfSection {
  gameName: string;
  rankings: OrganizationRankingPdfRow[];
}

function organizationRankingsFilename(championshipName: string, filterLabel: string): string {
  const filterSlug = filterLabel.replace(/\s+/g, "-").toLowerCase();
  return `${championshipName.replace(/\s+/g, "-").toLowerCase()}-rankings-${filterSlug}.pdf`;
}

/** Builds the organization rankings PDF (overall + per-game breakdown) without saving/opening it. */
export async function buildOrganizationRankingsDoc(
  championshipName: string,
  rows: OrganizationRankingPdfRow[],
  /** e.g. "Boys - Senior School" or "Overall" - the standings filter that was applied when exporting. */
  filterLabel: string = "Overall",
  /** Per-game breakdown, rendered as separate tables below the overall one. */
  byGame: GameOrganizationRankingPdfSection[] = [],
): Promise<{ doc: jsPDF; filename: string }> {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF();
  const contentY = await addPdfLogoHeader(doc);
  const titleEndY = addPdfTitle(doc, `${championshipName} - Overall Organization Rankings (${filterLabel})`, contentY + 6);
  autoTable(doc, {
    startY: titleEndY + 6,
    head: [["Position", "Organization / School / Team", "Total Points"]],
    body: rows.map((row) => [row.position, row.name, row.points]),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nextY = (doc as any).lastAutoTable.finalY + 10;

  for (const game of byGame) {
    const gameTitleEndY = addPdfTitle(doc, `${game.gameName} - Organization Ranking`, nextY, 11);
    autoTable(doc, {
      startY: gameTitleEndY,
      head: [["Position", "Organization / School / Team", "Points"]],
      body: game.rankings.map((row) => [row.position, row.name, row.points]),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nextY = (doc as any).lastAutoTable.finalY + 10;
  }

  addPdfFooter(doc);
  return { doc, filename: organizationRankingsFilename(championshipName, filterLabel) };
}

/** Builds and triggers a download of the organization rankings table as a branded PDF. */
export async function downloadOrganizationRankingsPdf(
  championshipName: string,
  rows: OrganizationRankingPdfRow[],
  filterLabel: string = "Overall",
  byGame: GameOrganizationRankingPdfSection[] = [],
): Promise<void> {
  const { doc, filename } = await buildOrganizationRankingsDoc(championshipName, rows, filterLabel, byGame);
  doc.save(filename);
}
