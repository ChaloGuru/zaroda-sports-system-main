import { addPdfLogoHeader, addPdfFooter, addPdfTitle } from "./pdf-logo";

export interface NominalRollLearner {
  bibNumber: number;
  name: string;
  gender: string;
  dateOfBirth: string | null;
  birthCertNumber: string | null;
  events: string[];
  /** JPEG/PNG data URL, or null when the learner has no photo. */
  photo: string | null;
}

export interface NominalRollSchool {
  schoolName: string;
  learners: NominalRollLearner[];
}

const PHOTO_SIZE = 16; // mm

function formatDob(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

/**
 * A school's signed nominal roll: every learner it entered, with photo, date
 * of birth, birth certificate entry number and events, and a certificate for
 * the head teacher to sign and stamp. One school per page (or more if long).
 */
export async function buildNominalRollDoc(championshipName: string, schools: NominalRollSchool[]) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (const [index, school] of schools.entries()) {
    if (index > 0) doc.addPage();
    const contentY = await addPdfLogoHeader(doc);
    const titleEndY = addPdfTitle(doc, `${championshipName} - Nominal Roll`, contentY + 6);
    const schoolEndY = addPdfTitle(doc, `${school.schoolName} (${school.learners.length} learner${school.learners.length === 1 ? "" : "s"})`, titleEndY + 4, 11);

    autoTable(doc, {
      startY: schoolEndY + 4,
      head: [["Photo", "Bib", "Name", "Gender", "Date of birth", "Birth cert. entry no.", "Events"]],
      body: school.learners.map((l) => ["", String(l.bibNumber), l.name, l.gender, formatDob(l.dateOfBirth), l.birthCertNumber ?? "-", l.events.join(", ") || "-"]),
      styles: { fontSize: 8, valign: "middle", minCellHeight: PHOTO_SIZE + 2 },
      columnStyles: { 0: { cellWidth: PHOTO_SIZE + 2 }, 1: { cellWidth: 12 }, 3: { cellWidth: 15 }, 4: { cellWidth: 22 }, 5: { cellWidth: 28 } },
      didDrawCell: (data) => {
        if (data.section !== "body" || data.column.index !== 0) return;
        const photo = school.learners[data.row.index]?.photo;
        if (!photo) return;
        doc.addImage(photo, photo.startsWith("data:image/png") ? "PNG" : "JPEG", data.cell.x + 1, data.cell.y + 1, PHOTO_SIZE, PHOTO_SIZE);
      },
    });

    // The head teacher's certificate, kept together on one page.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let y = ((doc as any).lastAutoTable?.finalY ?? schoolEndY) + 10;
    if (y + 52 > pageHeight - 14) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(9);
    doc.setTextColor(20);
    const statement = doc.splitTextToSize(
      `I certify that the learners listed above are bona fide learners of ${school.schoolName}, that the details and photographs given are correct, and that each learner is eligible to compete.`,
      doc.internal.pageSize.getWidth() - 28,
    ) as string[];
    doc.text(statement, 14, y);
    y += statement.length * 4.5 + 10;
    doc.text("Head teacher's name: ________________________________", 14, y);
    doc.text("Signature: ____________________", 130, y);
    y += 12;
    doc.text("Date: ____________________", 14, y);
    doc.text("School stamp:", 130, y);
    doc.rect(130, y + 2, 50, 22);
  }

  addPdfFooter(doc);
  return doc;
}
