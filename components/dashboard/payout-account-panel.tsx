"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Smartphone, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiDelete, apiGet, apiPost } from "@/lib/api-client";

interface PayoutAccount {
  subaccountStatus: "NOT_CONFIGURED" | "PENDING" | "ACTIVE" | "FAILED";
  tumaEmail: string | null;
}

/**
 * The manager's own TUMA account: open-tournament teams pay their registration fees by M-Pesa straight into it.
 * The API key is checked with TUMA, stored encrypted and never shown again.
 */
export function PayoutAccountPanel({ tenantId }: { tenantId?: string } = {}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const queryKey = ["tenant-payout-account", tenantId ?? "self"];
  const suffix = tenantId ? `?tenantId=${tenantId}` : "";

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiGet<{ payoutAccount: PayoutAccount }>(`/api/tenant/payout-account${suffix}`),
  });
  const account = data?.payoutAccount;
  const connected = account?.subaccountStatus === "ACTIVE" && !!account.tumaEmail;

  const connect = useMutation({
    mutationFn: () =>
      apiPost<{ payoutAccount: PayoutAccount }>("/api/tenant/payout-account", {
        tumaEmail: email.trim(),
        tumaApiKey: apiKey.trim(),
        ...(tenantId ? { tenantId } : {}),
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, { payoutAccount: result.payoutAccount });
      queryClient.invalidateQueries({ queryKey: ["tenant-payout-account"] });
      setApiKey("");
      toast.success("TUMA account connected - teams can now pay by M-Pesa.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not connect the TUMA account"),
  });

  const disconnect = useMutation({
    mutationFn: () => apiDelete<{ payoutAccount: PayoutAccount }>(`/api/tenant/payout-account${suffix}`),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, { payoutAccount: result.payoutAccount });
      queryClient.invalidateQueries({ queryKey: ["tenant-payout-account"] });
      toast.success("TUMA account disconnected.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not disconnect"),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" /> M-Pesa payout account (TUMA)
          </CardTitle>
          <CardDescription>
            Teams registering for your open tournaments pay their fees by M-Pesa, straight into your own TUMA account - Zaroda takes no
            commission on registration fees and never holds the money. This is separate from your Zaroda subscription.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {account && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3">
              {connected ? <CheckCircle2 className="h-4 w-4 text-[#2EA043]" /> : <AlertTriangle className="h-4 w-4 text-[#DA3633]" />}
              <span className="text-sm font-medium text-foreground">Status:</span>
              <Badge variant={connected ? "success" : "outline"}>{connected ? "Connected" : "Not connected"}</Badge>
              {connected && <span className="text-sm text-muted">TUMA account {account.tumaEmail}</span>}
            </div>
          )}

          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>
              Open a free account at{" "}
              <a href="https://tuma.co.ke" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                tuma.co.ke
              </a>{" "}
              and add the M-Pesa till or paybill the fees should go to.
            </li>
            <li>In the TUMA dashboard, copy your API key.</li>
            <li>Enter your TUMA email and the API key below. We check them with TUMA before saving.</li>
          </ol>

          <div className="space-y-2">
            <Label htmlFor="tuma-email">TUMA account email</Label>
            <Input id="tuma-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={account?.tumaEmail ?? "you@example.com"} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tuma-key">TUMA API key</Label>
            <Input id="tuma-key" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste the key" />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => connect.mutate()} disabled={!email.trim() || apiKey.trim().length < 8 || connect.isPending || isLoading}>
              {connect.isPending ? "Checking with TUMA..." : connected ? "Replace TUMA account" : "Connect TUMA account"}
            </Button>
            {connected && (
              <Button
                variant="outline"
                disabled={disconnect.isPending}
                onClick={() => window.confirm("Disconnect? Teams can't pay registration fees until an account is connected again.") && disconnect.mutate()}
              >
                Disconnect
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
