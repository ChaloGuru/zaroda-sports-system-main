"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiPost } from "@/lib/api-client";
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

  const selectedFee = fees.find((f) => f.id === feeId);
  const canSubmit = teamName.trim() && teamCode.trim() && contactEmail.trim() && feeId && !submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const result = await apiPost<{ authorizationUrl: string }>("/api/payments/initialize", {
        mode: "team_fee",
        championshipId,
        feeId,
        teamName: teamName.trim(),
        teamCode: teamCode.trim(),
        teamGender,
        contactName: contactName.trim() || undefined,
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim() || undefined,
      });
      window.location.href = result.authorizationUrl;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start payment");
      setSubmitting(false);
    }
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
          <Label htmlFor="contactPhone">Contact phone</Label>
          <Input id="contactPhone" className="mt-1.5" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
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
        {submitting ? "Redirecting to payment..." : "Continue to payment"}
      </Button>
      <p className="text-center text-xs text-muted">You&apos;ll be redirected to Paystack&apos;s secure checkout to complete payment.</p>
    </form>
  );
}
