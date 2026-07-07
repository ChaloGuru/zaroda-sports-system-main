"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { apiPost, apiGet } from "@/lib/api-client";
import { downloadPaymentReceiptPdf } from "@/lib/export-payment-receipt-pdf";
import type { ReceiptData } from "@/app/api/payments/receipt/route";

interface VerifyResponse {
  success: boolean;
  mode?: string;
  message: string;
}

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference") ?? searchParams.get("trxref");
  const [state, setState] = React.useState<"loading" | "success" | "failed">("loading");
  const [message, setMessage] = React.useState("Verifying your payment with Paystack...");
  const [downloading, setDownloading] = React.useState(false);

  React.useEffect(() => {
    if (!reference) {
      setState("failed");
      setMessage("No payment reference was found in the URL.");
      return;
    }

    apiPost<VerifyResponse>("/api/payments/verify", { reference })
      .then((result) => {
        setState(result.success ? "success" : "failed");
        setMessage(result.message);
      })
      .catch((error) => {
        setState("failed");
        setMessage(error instanceof Error ? error.message : "Verification failed");
      });
  }, [reference]);

  async function handleDownloadReceipt() {
    if (!reference) return;
    setDownloading(true);
    try {
      const receipt = await apiGet<ReceiptData>(`/api/payments/receipt?reference=${encodeURIComponent(reference)}`);
      await downloadPaymentReceiptPdf(receipt);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not generate receipt");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card className="w-full max-w-md text-center">
      <CardHeader className="items-center">
        {state === "loading" && <Loader2 className="h-12 w-12 animate-spin text-primary" />}
        {state === "success" && <CheckCircle2 className="h-12 w-12 text-green-500" />}
        {state === "failed" && <XCircle className="h-12 w-12 text-red-500" />}
        <CardTitle>
          {state === "loading" ? "Verifying payment" : state === "success" ? "Payment successful" : "Payment not completed"}
        </CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {state === "success" && (
          <Button variant="outline" className="w-full" onClick={handleDownloadReceipt} disabled={downloading}>
            {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download receipt
          </Button>
        )}
        <Button asChild className="w-full">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PaymentSuccessPage() {
  return (
    <div className="container flex min-h-[calc(100vh-4rem)] items-center justify-center py-16">
      <React.Suspense
        fallback={
          <Card className="w-full max-w-md text-center">
            <CardHeader className="items-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <CardTitle>Loading</CardTitle>
            </CardHeader>
          </Card>
        }
      >
        <PaymentSuccessContent />
      </React.Suspense>
    </div>
  );
}
