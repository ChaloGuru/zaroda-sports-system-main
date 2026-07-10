import { addPdfLogoHeader, addPdfFooter } from "./pdf-logo";

export interface JsGameWinnerRow {
  gameName: string;
  sport: string;
  gender: string;
  winningTeam: string;
}

/** Builds and triggers a download of the JS-level winning team per ball game as a branded PDF. */
export async function downloadJsGameWinnersPdf(
  championshipName: string,
  rows: JsGameWinnerRow[],
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF();
  const contentY = await addPdfLogoHeader(doc);
  doc.setFontSize(14);
  doc.text(`${championshipName} - JS Ball Games Winners`, 14, contentY + 6);
  autoTable(doc, {
    startY: contentY + 12,
    head: [["Game", "Sport", "Gender", "Winning Team"]],
    body: rows.map((row) => [row.gameName, row.sport, row.gender, row.winningTeam]),
  });
  addPdfFooter(doc);
  doc.save(`${championshipName.replace(/\s+/g, "-").toLowerCase()}-js-ball-games-winners.pdf`);
}
