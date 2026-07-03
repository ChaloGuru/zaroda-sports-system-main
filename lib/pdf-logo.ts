import type jsPDF from "jspdf";

let cachedLogoDataUrl: Promise<string> | null = null;

async function loadLogoDataUrl(): Promise<string> {
  const response = await fetch("/images/logo.png");
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Stamps the Zaroda Sports logo in the top-left of a jsPDF document and
 * returns the Y position (mm) below it where the rest of the page content
 * should start. Caches the fetched logo across calls within a session so
 * exporting several reports in a row only fetches it once.
 */
export async function addPdfLogoHeader(doc: jsPDF): Promise<number> {
  if (!cachedLogoDataUrl) cachedLogoDataUrl = loadLogoDataUrl();
  const dataUrl = await cachedLogoDataUrl;
  doc.addImage(dataUrl, "PNG", 14, 8, 30, 20);
  return 34;
}

/**
 * Stamps "Powered by Zaroda Solutions" centered at the bottom of every page
 * in the document. Call this last, right before doc.save(), since it needs
 * the final page count.
 */
export function addPdfFooter(doc: jsPDF): void {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text("Powered by Zaroda Solutions", pageWidth / 2, pageHeight - 8, { align: "center" });
  }
}
