import { addPdfLogoHeader, addPdfFooter, addPdfTitle } from "./pdf-logo";

export interface TeamRosterPdfRow {
  jerseyNumber: number | null;
  firstName: string;
  lastName: string;
  playingPosition: string | null;
  /** School teams: the player's date of birth (ISO) and photo (data URL). */
  dateOfBirth?: string | null;
  photo?: string | null;
}

const PHOTO_SIZE = 14; // mm

function formatDob(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

/**
 * Builds and triggers a download of a team's player roster as a branded PDF.
 * With photos (school teams) it doubles as the sheet officials check players
 * against before a match.
 */
export async function downloadTeamRosterPdf(
  championshipName: string,
  teamName: string,
  rows: TeamRosterPdfRow[],
  withIdentity = false,
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF();
  const contentY = await addPdfLogoHeader(doc);
  const titleEndY = addPdfTitle(doc, `${championshipName} - ${teamName} Roster`, contentY + 6);
  if (withIdentity) {
    autoTable(doc, {
      startY: titleEndY + 6,
      head: [["Photo", "#", "Player", "Date of birth", "Position"]],
      body: rows.map((row) => ["", row.jerseyNumber ?? "-", `${row.firstName} ${row.lastName}`, formatDob(row.dateOfBirth), row.playingPosition ?? "-"]),
      styles: { valign: "middle", minCellHeight: PHOTO_SIZE + 2 },
      columnStyles: { 0: { cellWidth: PHOTO_SIZE + 2 }, 1: { cellWidth: 12 } },
      didDrawCell: (data) => {
        if (data.section !== "body" || data.column.index !== 0) return;
        const photo = rows[data.row.index]?.photo;
        if (!photo) return;
        doc.addImage(photo, photo.startsWith("data:image/png") ? "PNG" : "JPEG", data.cell.x + 1, data.cell.y + 1, PHOTO_SIZE, PHOTO_SIZE);
      },
    });
  } else {
    autoTable(doc, {
      startY: titleEndY + 6,
      head: [["#", "Player", "Position"]],
      body: rows.map((row) => [row.jerseyNumber ?? "-", `${row.firstName} ${row.lastName}`, row.playingPosition ?? "-"]),
    });
  }
  addPdfFooter(doc);
  doc.save(`${teamName.replace(/s+/g, "-").toLowerCase()}-roster.pdf`);
}
