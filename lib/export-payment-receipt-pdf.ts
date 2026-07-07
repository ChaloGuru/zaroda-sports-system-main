import { addPdfLogoHeader, addPdfFooter, addPdfWatermark } from "./pdf-logo";
import type { ReceiptData } from "@/app/api/payments/receipt/route";

/** Builds and triggers a download of a paid transaction's receipt as a branded PDF. */
export async function downloadPaymentReceiptPdf(receipt: ReceiptData): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  await addPdfWatermark(doc);
  const contentY = await addPdfLogoHeader(doc);

  doc.setFontSize(16);
  doc.text("Payment Receipt", 14, contentY + 10);

  const paidAt = receipt.paidAt ? new Date(receipt.paidAt) : null;
  const rows: [string, string][] = [
    ["Reference", receipt.reference],
    ["Paid to", receipt.payerName],
    ["Description", receipt.description],
    ["Amount", `KES ${receipt.amountKes.toLocaleString()}`],
    ["Status", receipt.status],
    ["Date", paidAt ? paidAt.toLocaleString("en-KE") : "-"],
  ];

  doc.setFontSize(11);
  let y = contentY + 24;
  for (const [label, value] of rows) {
    doc.setTextColor(120);
    doc.text(label, 14, y);
    doc.setTextColor(20);
    doc.text(value, 60, y);
    y += 9;
  }

  addPdfFooter(doc);
  doc.save(`receipt-${receipt.reference}.pdf`);
}
