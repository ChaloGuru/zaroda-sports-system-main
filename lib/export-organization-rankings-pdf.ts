import { addPdfLogoHeader } from "./pdf-logo";

export interface OrganizationRankingPdfRow {
  position: number;
  name: string;
  points: number;
}

/** Builds and triggers a download of the organization rankings table as a branded PDF. */
export async function downloadOrganizationRankingsPdf(
  championshipName: string,
  rows: OrganizationRankingPdfRow[],
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF();
  const contentY = await addPdfLogoHeader(doc);
  doc.setFontSize(14);
  doc.text(`${championshipName} - Overall Organization Rankings`, 14, contentY + 6);
  autoTable(doc, {
    startY: contentY + 12,
    head: [["Position", "Organization / School / Team", "Total Points"]],
    body: rows.map((row) => [row.position, row.name, row.points]),
  });
  doc.save(`${championshipName.replace(/\s+/g, "-").toLowerCase()}-rankings.pdf`);
}
