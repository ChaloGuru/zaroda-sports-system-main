import { addPdfLogoHeader } from "./pdf-logo";

export interface GameStandingsPdfRow {
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gd: number;
  points: number;
}

/** Builds and triggers a download of one game's standings table as a branded PDF. */
export async function downloadGameStandingsPdf(gameName: string, rows: GameStandingsPdfRow[]): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF();
  const contentY = await addPdfLogoHeader(doc);
  doc.setFontSize(14);
  doc.text(`${gameName} - Standings`, 14, contentY + 6);
  autoTable(doc, {
    startY: contentY + 12,
    head: [["Team", "P", "W", "D", "L", "+/-", "Pts"]],
    body: rows.map((row) => [row.teamName, row.played, row.won, row.drawn, row.lost, row.gd, row.points]),
  });
  doc.save(`${gameName.replace(/\s+/g, "-").toLowerCase()}-standings.pdf`);
}
