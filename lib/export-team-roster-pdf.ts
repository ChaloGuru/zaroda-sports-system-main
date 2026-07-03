import { addPdfLogoHeader, addPdfFooter } from "./pdf-logo";

export interface TeamRosterPdfRow {
  jerseyNumber: number | null;
  firstName: string;
  lastName: string;
  playingPosition: string | null;
}

/** Builds and triggers a download of a team's player roster as a branded PDF. */
export async function downloadTeamRosterPdf(
  championshipName: string,
  teamName: string,
  rows: TeamRosterPdfRow[],
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF();
  const contentY = await addPdfLogoHeader(doc);
  doc.setFontSize(14);
  doc.text(`${championshipName} - ${teamName} Roster`, 14, contentY + 6);
  autoTable(doc, {
    startY: contentY + 12,
    head: [["#", "Player", "Position"]],
    body: rows.map((row) => [row.jerseyNumber ?? "-", `${row.firstName} ${row.lastName}`, row.playingPosition ?? "-"]),
  });
  addPdfFooter(doc);
  doc.save(`${teamName.replace(/\s+/g, "-").toLowerCase()}-roster.pdf`);
}
