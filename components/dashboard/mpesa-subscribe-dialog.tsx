"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet, apiPost } from "@/lib/api-client";
import { formatKes } from "@/lib/utils";

/** How long to wait for M-Pesa before saying the prompt may have expired. */
const WAIT_MS = 3 * 60_000;

interface PaymentStatus {
  status: "PENDING" | "PAID" | "FAILED";
  message: string | null;
  mpesaReceipt: string | null;
}

/**
 * Pays for a subscription by M-Pesa: TUMA sends the PIN prompt to the phone
 * entered here, and this waits for the payment to come through.
 */
export function MpesaSubscribeDialog({
  plan,
  championshipId,
  defaultPhone,
  onClose,
  onPaid,
}: {
  plan: { id: string; displayName: string; priceKes: number };
  championshipId?: string;
  defaultPhone?: string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [phone, setPhone] = React.useState(defaultPhone ?? "");
  const [sending, setSending] = React.useState(false);
  const [payment, setPayment] = React.useState<{ id: string; phone: string; startedAt: number } | null>(null);

  const waiting = !!payment && Date.now() - payment.startedAt < WAIT_MS;
  const { data: status } = useQuery({
    queryKey: ["subscription-payment", payment?.id],
    queryFn: () => apiGet<PaymentStatus>(`/api/payments/subscribe?id=${payment!.id}`),
    enabled: !!payment,
    refetchInterval: (query) => (query.state.data?.status === "PENDING" || !query.state.data) && waiting ? 3000 : false,
  });

  React.useEffect(() => {
    if (status?.status === "PAID") {
      toast.success(`${plan.displayName} is active`);
      onPaid();
    }
  }, [status?.status, plan.displayName, onPaid]);

  async function pay() {
    setSending(true);
    try {
      const result = await apiPost<{ paymentId: string; phone: string }>("/api/payments/subscribe", { planId: plan.id, championshipId, phone });
      setPayment({ id: result.paymentId, phone: result.phone, startedAt: Date.now() });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start the payment");
    } finally {
      setSending(false);
    }
  }

  const failed = status?.status === "FAILED";
  const expired = !!payment && status?.status === "PENDING" && !waiting;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay with M-Pesa</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted">
          {plan.displayName} - <strong className="text-foreground">{formatKes(plan.priceKes)}</strong>
        </p>

        {status?.status === "PAID" ? (
          <div className="flex items-center gap-3 rounded-md bg-secondary p-4 text-sm text-foreground">
            <CheckCircle2 className="h-5 w-5 text-[#15803D]" />
            <span>
              Paid{status.mpesaReceipt ? ` - M-Pesa receipt ${status.mpesaReceipt}` : ""}. Your subscription is active.
            </span>
          </div>
        ) : payment && !failed && !expired ? (
          <div className="flex items-center gap-3 rounded-md bg-secondary p-4 text-sm text-foreground">
            <Smartphone className="h-5 w-5 shrink-0 text-primary" />
            <span>
              Check your phone ({payment.phone.replace(/^254/, "0")}) and enter your M-Pesa PIN to pay. This page updates
              once the payment comes through.
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            {failed && <p className="text-sm font-medium text-destructive">{status?.message || "The payment didn't go through."} Try again.</p>}
            {expired && <p className="text-sm font-medium text-destructive">No payment came through - the prompt may have expired. Try again.</p>}
            <div>
              <Label htmlFor="mpesa-phone">M-Pesa phone number</Label>
              <Input
                id="mpesa-phone"
                type="tel"
                inputMode="tel"
                placeholder="0712 345 678"
                className="mt-1.5"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              disabled={sending || phone.trim().length < 9}
              onClick={() => {
                setPayment(null);
                void pay();
              }}
            >
              {sending ? "Sending prompt..." : `Send M-Pesa prompt for ${formatKes(plan.priceKes)}`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
