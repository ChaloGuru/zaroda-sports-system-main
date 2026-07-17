import type jsPDF from "jspdf";

let cachedLogoDataUrl: Promise<string> | null = null;
let cachedHeaderLogoDataUrl: Promise<string> | null = null;

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
 * Downscales the source logo to a small header-sized raster before jsPDF
 * embeds it. jsPDF embeds images at their native pixel dimensions regardless
 * of the mm size they're drawn at, so feeding it the full-resolution source
 * (used for on-screen display) bloated every exported PDF by several MB.
 */
async function loadHeaderLogoDataUrl(): Promise<string> {
  const dataUrl = await loadLogoDataUrl();
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = dataUrl;
  });

  // Header is drawn at 30x20mm; a ~180x120px raster (6x that at typical print
  // density) is more than enough detail and keeps the embedded image tiny.
  const maxSrc = 180;
  const scale = Math.min(1, maxSrc / Math.max(img.width, img.height));
  const drawW = Math.round(img.width * scale);
  const drawH = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = drawW;
  canvas.height = drawH;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, drawW, drawH);

  return canvas.toDataURL("image/png");
}

/**
 * Stamps the Zaroda Sports logo in the top-left of a jsPDF document and
 * returns the Y position (mm) below it where the rest of the page content
 * should start. Caches the fetched logo across calls within a session so
 * exporting several reports in a row only fetches it once.
 */
export async function addPdfLogoHeader(doc: jsPDF): Promise<number> {
  if (!cachedHeaderLogoDataUrl) cachedHeaderLogoDataUrl = loadHeaderLogoDataUrl();
  const dataUrl = await cachedHeaderLogoDataUrl;
  doc.addImage(dataUrl, "PNG", 14, 8, 30, 20);

  doc.setFontSize(13);
  doc.setTextColor(20);
  doc.text("Zaroda Solutions", 48, 16);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text("0781230805  |  zarodasports.live", 48, 22);

  return 34;
}

/**
 * Draws a report title that wraps within the page margins instead of running
 * off the right edge - championship names combined with a game/report label
 * easily exceed a single 180mm line at 14pt, which without wrapping just
 * overflows past the page boundary (looks like overlapping/cut-off text).
 * Returns the Y position (mm) below the title where content should start.
 */
export function addPdfTitle(doc: jsPDF, text: string, startY: number, fontSize = 14): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const maxWidth = pageWidth - marginX * 2;

  doc.setFontSize(fontSize);
  doc.setTextColor(20);
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  doc.text(lines, marginX, startY);

  const lineHeight = fontSize * 0.55;
  return startY + lines.length * lineHeight;
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
