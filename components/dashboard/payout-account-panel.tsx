"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Landmark, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPost } from "@/lib/api-client";

interface Bank {
  name: string;
  code: string;
  slug: string;
}

interface PayoutAccount {
  subaccountStatus: "NOT_CONFIGURED" | "PENDING" | "ACTIVE" | "FAILED";
  settlementBankName: string | null;
  settlementBankCode: string | null;
  settlementAccountNumber: string | null;
  settlementAccountName: string | null;
}

const STATUS_LABEL: Record<PayoutAccount["subaccountStatus"], string> = {
  NOT_CONFIGURED: "Not configured",
  PENDING: "Pending",
  ACTIVE: "Active",
  FAILED: "Failed",
};

export function PayoutAccountPanel({ tenantId }: { tenantId?: string } = {}) {
  const queryClient = useQueryClient();
  const [bankCode, setBankCode] = React.useState("");
  const [accountNumber, setAccountNumber] = React.useState("");
  const queryKey = ["tenant-payout-account", tenantId ?? "self"];

  const { data: banksData, isLoading: banksLoading } = useQuery({
    queryKey: ["paystack-banks"],
    queryFn: () => apiGet<{ banks: Bank[] }>("/api/paystack/banks"),
  });
  const { data: payoutData, isLoading: payoutLoading } = useQuery({
    queryKey,
    queryFn: () =>
      apiGet<{ payoutAccount: PayoutAccount }>(
        `/api/tenant/payout-account${tenantId ? `?tenantId=${tenantId}` : ""}`,
      ),
  });

  const banks = banksData?.banks ?? [];
  const payoutAccount = payoutData?.payoutAccount;
  const selectedBank = banks.find((b) => b.code === bankCode);

  const submit = useMutation({
    mutationFn: () => {
      if (!selectedBank) throw new Error("Select a bank");
      return apiPost<{ payoutAccount: PayoutAccount }>("/api/tenant/payout-account", {
        settlementBankCode: selectedBank.code,
        settlementBankName: selectedBank.name,
        accountNumber,
        ...(tenantId ? { tenantId } : {}),
      });
    },
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, { payoutAccount: result.payoutAccount });
      if (result.payoutAccount.subaccountStatus === "ACTIVE") {
        toast.success("Payout account configured - confirm the account name below matches your own.");
      }
    },
    onError: (error) => {
      queryClient.invalidateQueries({ queryKey });
      toast.error(error instanceof Error ? error.message : "Failed to configure payout account");
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" /> Payout Account
          </CardTitle>
          <CardDescription>
            The bank account that receives team registration fees for your open-tournament championships.
            100% of every fee settles here - Zaroda takes no commission on registration fees. This is separate
            from your Zaroda subscription billing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {payoutAccount && (
            <div className="flex items-center gap-2 rounded-md border border-border p-3">
              {payoutAccount.subaccountStatus === "ACTIVE" ? (
                <CheckCircle2 className="h-4 w-4 text-[#2EA043]" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-[#DA3633]" />
              )}
              <span className="text-sm font-medium text-foreground">Status:</span>
              <Badge variant={payoutAccount.subaccountStatus === "ACTIVE" ? "success" : "outline"}>
                {STATUS_LABEL[payoutAccount.subaccountStatus]}
              </Badge>
            </div>
          )}

          {payoutAccount?.subaccountStatus === "ACTIVE" && (
            <div className="rounded-md border border-border bg-surface-raised p-3 text-sm">
              <p className="text-muted">Confirm this is your correct account name before proceeding:</p>
              <p className="mt-1 font-semibold text-foreground">{payoutAccount.settlementAccountName}</p>
              <p className="text-muted">
                {payoutAccount.settlementBankName} - {payoutAccount.settlementAccountNumber}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Bank</Label>
            <Select value={bankCode} onValueChange={setBankCode} disabled={banksLoading}>
              <SelectTrigger>
                <SelectValue placeholder={banksLoading ? "Loading banks..." : "Select your bank"} />
              </SelectTrigger>
              <SelectContent>
                {banks.map((b) => (
                  <SelectItem key={b.code} value={b.code}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Account number</Label>
            <Input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="e.g. 1234567890"
            />
          </div>

          <Button
            onClick={() => submit.mutate()}
            disabled={!bankCode || !accountNumber.trim() || submit.isPending || payoutLoading}
          >
            {submit.isPending ? "Verifying with Paystack..." : "Save payout account"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
