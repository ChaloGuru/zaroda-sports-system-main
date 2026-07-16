import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatKes } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing | Zaroda Sports Management System",
  description:
    "Simple per-level pricing in KES for Kenyan school championships - Base level is free; Zone through National levels unlock the full platform for a flat fee.",
};

const ESSENTIAL_TIERS = [
  { level: "Base", priceKes: 0 },
  { level: "Zone", priceKes: 580 },
  { level: "Sub-County", priceKes: 1160 },
  { level: "County", priceKes: 2320 },
  { level: "Regional", priceKes: 3480 },
  { level: "National", priceKes: 5800 },
  { level: "Open Tournament", priceKes: 5800 },
];

const FEATURES = [
  "Event setup & registration",
  "Digital results capture",
  "Printable PDF results sheets",
  "Public results portal",
  "Multi-level participant performance tracking",
  "Data archive",
  "Basic rankings",
  "Offline + online functionality",
];

export default function PricingPage() {
  return (
    <div className="container py-16">
      <div className="mx-auto max-w-2xl text-center">
        <Badge variant="warning" className="mb-4">Essential tier</Badge>
        <h1 className="text-4xl font-bold text-foreground">Simple, per-level pricing in KES</h1>
        <p className="mt-4 text-muted">
          <span className="font-semibold text-primary">Base level championships are always free</span> and never count
          against any quota. Pay only once to unlock a specific level for a championship - Zone through National.
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {ESSENTIAL_TIERS.map((tier) => (
          <Card key={tier.level} className="flex flex-col">
            <CardHeader>
              <CardTitle>{tier.level}</CardTitle>
              <p className="font-mono text-3xl font-bold tabular-nums text-primary">{formatKes(tier.priceKes)}</p>
              <p className="text-sm text-muted">per championship, per level</p>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between gap-6">
              <ul className="space-y-2 text-sm text-foreground">
                {FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button asChild>
                <Link href="/signup">Get started</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mx-auto mt-12 max-w-3xl border-2 border-primary bg-surface-overlay">
        <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
          <p className="text-lg font-semibold text-foreground">Base level is always free</p>
          <p className="text-muted">
            Every tenant can run unlimited Base-level championships at zero cost, indefinitely. Upgrade only the
            specific championship and level you need, when you need it.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
