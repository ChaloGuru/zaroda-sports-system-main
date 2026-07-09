"use client";

import * as React from "react";
import { Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api-client";
import { downloadPaymentReceiptPdf } from "@/lib/export-payment-receipt-pdf";
import type { ReceiptData } from "@/app/api/payments/receipt/route";

export function DownloadReceiptButton({ reference }: { reference: string }) {
  const [downloading, setDownloading] = React.useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDownloading(true);
    try {
      const receipt = await apiGet<ReceiptData>(`/api/payments/receipt?reference=${encodeURIComponent(reference)}`);
      await downloadPaymentReceiptPdf(receipt);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not generate receipt");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={downloading}>
      {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      Receipt
    </Button>
  );
}
