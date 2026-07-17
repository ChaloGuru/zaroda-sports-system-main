import { addPdfLogoHeader, addPdfFooter, addPdfTitle } from "./pdf-logo";

export interface OrganizationRankingPdfRow {
  position: number;
  name: string;
  points: number;
}

/** Builds and triggers a download of the organization rankings table as a branded PDF. */
export async function downloadOrganizationRankingsPdf(
  championshipName: string,
  rows: OrganizationRankingPdfRow[],
  /** e.g. "Boys - Senior School" or "Overall" - the standings filter that was applied when exporting. */
  filterLabel: string = "Overall",
): Promise<void> {
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
  addPdfFooter(doc);
  doc.save(`${championshipName.replace(/\s+/g, "-").toLowerCase()}-rankings.pdf`);
}
