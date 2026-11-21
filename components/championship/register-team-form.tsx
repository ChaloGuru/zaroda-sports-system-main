"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPost } from "@/lib/api-client";
import { downloadPaymentReceiptPdf } from "@/lib/export-payment-receipt-pdf";
import type { ReceiptData } from "@/app/api/payments/receipt/route";
import { formatKes } from "@/lib/utils";

interface FeeOption {
  id: string;
  name: string;
  description: string | null;
  amountKes: number;
  isRequired: boolean;
}

export function RegisterTeamForm({ championshipId, fees }: { championshipId: string; fees: FeeOption[] }) {
  const requiredFees = fees.filter((f) => f.isRequired);
  const [feeId, setFeeId] = React.useState((requiredFees[0] ?? fees[0])?.id ?? "");
  const [teamName, setTeamName] = React.useState("");
  const [teamCode, setTeamCode] = React.useState("");
  const [teamGender, setTeamGender] = React.useState("MIXED");
  const [contactName, setContactName] = React.useState("");
  const [contactEmail, setContactEmail] = React.useState("");
  const [contactPhone, setContactPhone] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  // After the M-Pesa prompt is sent: waiting for TUMA's answer, then paid or failed.
  const [payment, setPayment] = React.useState<{ id: string; phone: string; state: "WAITING" | "PAID" | "FAILED"; message?: string; reference?: string } | null>(null);
  const [downloading, setDownloading] = React.useState(false);

  React.useEffect(() => {
    if (!payment || payment.state !== "WAITING") return;
    const started = Date.now();
    const timer = window.setInterval(async () => {
      try {
        const r = await apiGet<{ status: "PENDING" | "PAID" | "FAILED"; message: string | null; reference: string | null }>(`/api/payments/initialize?id=${payment.id}`);
        if (r.status === "PAID") setPayment((p) => p && { ...p, state: "PAID", reference: r.reference ?? undefined });
        else if (r.status === "FAILED") setPayment((p) => p && { ...p, state: "FAILED", message: r.message ?? "The payment did not go through" });
        else if (Date.now() - started > 3 * 60_000) setPayment((p) => p && { ...p, state: "FAILED", message: "No answer from M-Pesa yet. If you paid, the team will appear once it is confirmed - otherwise try again." });
      } catch {
        // Keep waiting; a brief network hiccup shouldn't end the wait.
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [payment]);

  async function downloadReceipt() {
    if (!payment?.reference) return;
    setDownloading(true);
    try {
      await downloadPaymentReceiptPdf(await apiGet<ReceiptData>(`/api/payments/receipt?reference=${encodeURIComponent(payment.reference)}`));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not make the receipt");
    } finally {
      setDownloading(false);
    }
  }

  const selectedFee = fees.find((f) => f.id === feeId);
  const canSubmit = teamName.trim() && teamCode.trim() && contactEmail.trim() && contactPhone.trim() && feeId && !submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const result = await apiPost<{ paymentId: string; phone: string }>("/api/payments/initialize", {
        mode: "team_fee",
        championshipId,
        feeId,
        teamName: teamName.trim(),
        teamCode: teamCode.trim(),
        teamGender,
        contactName: contactName.trim() || undefined,
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim(),
      });
      setPayment({ id: result.paymentId, phone: result.phone, state: "WAITING" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start payment");
    } finally {
      setSubmitting(false);
    }
  }

  if (payment) {
    return (
      <div className="mt-8 space-y-4 rounded-md border border-border bg-secondary/40 p-6 text-center">
        {payment.state === "WAITING" && (
          <>
            <p className="text-lg font-semibold text-foreground">Check the phone {payment.phone}</p>
            <p className="text-sm text-muted">Enter your M-Pesa PIN to pay {selectedFee ? formatKes(selectedFee.amountKes) : "the fee"}. This page updates by itself once it is paid.</p>
          </>
        )}
        {payment.state === "PAID" && (
          <>
            <p className="text-lg font-semibold text-foreground">Paid - {teamName.trim()} is registered</p>
            <p className="text-sm text-muted">The organiser now sees your team. Keep your M-Pesa message as proof of payment.</p>
            {payment.reference && (
              <Button variant="outline" onClick={downloadReceipt} disabled={downloading}>
                {downloading ? "Making the receipt..." : "Download receipt"}
              </Button>
            )}
          </>
        )}
        {payment.state === "FAILED" && (
          <>
            <p className="text-lg font-semibold text-foreground">The payment did not go through</p>
            <p className="text-sm text-muted">{payment.message}</p>
            <Button onClick={() => setPayment(null)}>Try again</Button>
          </>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="teamName">Team / organization name</Label>
          <Input id="teamName" className="mt-1.5" value={teamName} onChange={(e) => setTeamName(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="teamCode">Team code (short abbreviation)</Label>
          <Input id="teamCode" className="mt-1.5" value={teamCode} onChange={(e) => setTeamCode(e.target.value)} required />
        </div>
      </div>

      <div>
        <Label>Team gender category</Label>
        <Select value={teamGender} onValueChange={setTeamGender}>
          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="BOYS">Boys / Men</SelectItem>
            <SelectItem value="GIRLS">Girls / Women</SelectItem>
            <SelectItem value="MIXED">Mixed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="contactName">Contact person</Label>
          <Input id="contactName" className="mt-1.5" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="contactPhone">M-Pesa number to pay from</Label>
          <Input id="contactPhone" className="mt-1.5" inputMode="tel" placeholder="0712 345 678" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} required />
        </div>
      </div>
      <div>
        <Label htmlFor="contactEmail">Contact email (payment receipt is sent here)</Label>
        <Input id="contactEmail" type="email" className="mt-1.5" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} required />
      </div>

      {fees.length > 1 && (
        <div>
          <Label>Fee to pay now</Label>
          <Select value={feeId} onValueChange={setFeeId}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {fees.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name} - {formatKes(f.amountKes)} {f.isRequired ? "" : "(optional)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {selectedFee && (
        <div className="rounded-md border border-border bg-secondary/40 p-4">
          <p className="font-medium text-foreground">{selectedFee.name}</p>
          {selectedFee.description && <p className="text-sm text-muted">{selectedFee.description}</p>}
          <p className="mt-2 text-2xl font-bold text-primary">{formatKes(selectedFee.amountKes)}</p>
        </div>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={!canSubmit}>
        {submitting ? "Sending the M-Pesa prompt..." : "Pay by M-Pesa"}
      </Button>
      <p className="text-center text-xs text-muted">An M-Pesa prompt is sent to the number above. Enter your PIN on the phone to pay.</p>
    </form>
  );
}
