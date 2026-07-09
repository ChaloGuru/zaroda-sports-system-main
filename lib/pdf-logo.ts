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

  doc.setFontSize(13);
  doc.setTextColor(20);
  doc.text("Zaroda Solutions", 48, 16);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text("0781230805  |  zarodasports.live", 48, 22);

  return 34;
}

let cachedRotatedWatermarkDataUrl: Promise<string> | null = null;

/**
 * Rotates the logo -30deg onto an offscreen canvas so we control the pivot
 * directly, rather than relying on jsPDF's addImage rotation (which pivots
 * around the image's placement anchor, not its visual center, and is easy to
 * get backwards). The canvas is sized to the rotated bounding box so the
 * flattened image can then be centered on the page with plain (non-rotated)
 * math.
 */
async function loadRotatedWatermarkDataUrl(): Promise<string> {
  const dataUrl = await (cachedLogoDataUrl ?? (cachedLogoDataUrl = loadLogoDataUrl()));
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = dataUrl;
  });

  const angleRad = (-30 * Math.PI) / 180;
  // Cap the source resolution before rotating - at 6% opacity the extra detail
  // from the full-size logo is invisible but bloats the exported PDF several MB.
  const maxSrc = 600;
  const scale = Math.min(1, maxSrc / Math.max(img.width, img.height));
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const src = Math.max(drawW, drawH);
  const bbox = Math.ceil(src * (Math.abs(Math.cos(angleRad)) + Math.abs(Math.sin(angleRad))));

  const canvas = document.createElement("canvas");
  canvas.width = bbox;
  canvas.height = bbox;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(bbox / 2, bbox / 2);
  ctx.rotate(angleRad);
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

  return canvas.toDataURL("image/png");
}

/**
 * Stamps a large, faint, centered, diagonal copy of the logo behind the page
 * content as a watermark. Call this before drawing any text/tables for the
 * page so the watermark stays behind them in the render order.
 */
export async function addPdfWatermark(doc: jsPDF): Promise<void> {
  if (!cachedRotatedWatermarkDataUrl) cachedRotatedWatermarkDataUrl = loadRotatedWatermarkDataUrl();
  const dataUrl = await cachedRotatedWatermarkDataUrl;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const size = Math.min(pageWidth, pageHeight) * 0.85;

  doc.saveGraphicsState();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc.setGState(new (doc as any).GState({ opacity: 0.06 }));
  doc.addImage(
    dataUrl,
    "PNG",
    (pageWidth - size) / 2,
    (pageHeight - size) / 2,
    size,
    size,
  );
  doc.restoreGraphicsState();
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
