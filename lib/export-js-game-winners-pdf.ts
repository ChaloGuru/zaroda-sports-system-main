import type jsPDF from "jspdf";
import { addPdfLogoHeader, addPdfFooter, addPdfTitle } from "./pdf-logo";

export interface JsGameWinnerRow {
  gameName: string;
  sport: string;
  gender: string;
  schoolLevel: string;
  winningTeam: string;
}

const SCHOOL_LEVEL_LABELS: Record<string, string> = {
  JS: "JS",
  PRIMARY: "Primary",
  SENIOR_SCHOOL: "Senior School",
  TERTIARY: "Tertiary",
};

// One distinct fill colour per school level so groups are easy to scan.
const SCHOOL_LEVEL_COLORS: Record<string, [number, number, number]> = {
  JS: [219, 234, 254], // light blue
  PRIMARY: [220, 252, 231], // light green
  SENIOR_SCHOOL: [254, 249, 195], // light yellow
  TERTIARY: [254, 226, 226], // light red
};
const DEFAULT_ROW_COLOR: [number, number, number] = [243, 244, 246]; // light gray

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
    head: [["Game", "Sport", "Gender", "Level", "Winning Team"]],
    body: rows.map((row) => [
      row.gameName,
      row.sport,
      row.gender,
      SCHOOL_LEVEL_LABELS[row.schoolLevel] ?? row.schoolLevel,
      row.winningTeam,
    ]),
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const level = rows[data.row.index]?.schoolLevel;
      data.cell.styles.fillColor = SCHOOL_LEVEL_COLORS[level ?? ""] ?? DEFAULT_ROW_COLOR;
    },
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
