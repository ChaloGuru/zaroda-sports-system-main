import type jsPDF from "jspdf";
import { addPdfLogoHeader, addPdfFooter, addPdfTitle } from "./pdf-logo";

export interface JsGameWinnerRow {
  gameName: string;
  sport: string;
  gender: string;
  winningTeam: string;
}

/** Builds the JS ball games winners PDF without saving/opening it. */
export async function buildJsGameWinnersDoc(
  championshipName: string,
  rows: JsGameWinnerRow[],
): Promise<{ doc: jsPDF; filename: string }> {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF();
  const contentY = await addPdfLogoHeader(doc);
  const titleEndY = addPdfTitle(doc, `${championshipName} - Winning Teams`, contentY + 6);
  autoTable(doc, {
    startY: titleEndY + 6,
    head: [["Game", "Sport", "Gender", "Winning Team"]],
    body: rows.map((row) => [row.gameName, row.sport, row.gender, row.winningTeam]),
  });
  addPdfFooter(doc);
  const filename = `${championshipName.replace(/\s+/g, "-").toLowerCase()}-winning-teams.pdf`;
  return { doc, filename };
}

/** Builds and triggers a download of the JS-level winning team per ball game as a branded PDF. */
export async function downloadJsGameWinnersPdf(
  championshipName: string,
  rows: JsGameWinnerRow[],
): Promise<void> {
  const { doc, filename } = await buildJsGameWinnersDoc(championshipName, rows);
  doc.save(filename);
}
