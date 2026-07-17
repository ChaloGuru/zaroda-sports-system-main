import { addPdfLogoHeader, addPdfFooter, addPdfTitle } from "./pdf-logo";

export interface GameStandingsPdfRow {
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

/** Builds and triggers a download of one game's standings table as a branded PDF. */
export async function downloadGameStandingsPdf(
  championshipName: string,
  gameName: string,
  rows: GameStandingsPdfRow[],
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF();
  const contentY = await addPdfLogoHeader(doc);
  const titleEndY = addPdfTitle(doc, `${championshipName} - ${gameName} Standings`, contentY + 6);
  autoTable(doc, {
    startY: titleEndY + 6,
    head: [["Team", "P", "W", "D", "L", "GF", "GA", "GD", "Pts"]],
    body: rows.map((row) => [row.teamName, row.played, row.won, row.drawn, row.lost, row.gf, row.ga, row.gd, row.points]),
  });
  addPdfFooter(doc);
  doc.save(`${gameName.replace(/\s+/g, "-").toLowerCase()}-standings.pdf`);
}
