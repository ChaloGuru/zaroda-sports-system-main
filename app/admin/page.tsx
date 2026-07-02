import { redirect } from "next/navigation";
import { Building2, Trophy, Banknote, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PanelErrorBoundary } from "@/components/error-boundary";
import { OverviewCharts } from "@/components/admin/overview-charts";
import { requireRole } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";

function monthKey(date: Date): string {
  return date.toLocaleDateString("en-KE", { month: "short", year: "2-digit" });
}

function lastNMonths(n: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(monthKey(d));
  }
  return months;
}

export default async function AdminOverviewPage() {
  try {
    await requireRole(["SUPER_ADMIN"]);
  } catch {
    redirect("/dashboard");
  }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [tenantCount, championshipCount, participantCount, tenants, championships, paidTransactions] = await Promise.all([
    prisma.tenant.count(),
    prisma.championship.count(),
    prisma.participant.count(),
    prisma.tenant.findMany({ where: { createdAt: { gte: sixMonthsAgo } }, select: { createdAt: true } }),
    prisma.championship.groupBy({ by: ["level"], _count: { level: true } }),
    prisma.paymentTransaction.findMany({ where: { status: "PAID", createdAt: { gte: sixMonthsAgo } }, select: { amountKes: true, createdAt: true } }),
  ]);

  const months = lastNMonths(6);
  const signupBuckets = new Map(months.map((m) => [m, 0]));
  for (const t of tenants) {
    const key = monthKey(t.createdAt);
    if (signupBuckets.has(key)) signupBuckets.set(key, (signupBuckets.get(key) ?? 0) + 1);
  }
  const signups = months.map((month) => ({ month, count: signupBuckets.get(month) ?? 0 }));

  const revenueBuckets = new Map(months.map((m) => [m, 0]));
  for (const tx of paidTransactions) {
    const key = monthKey(tx.createdAt);
    if (revenueBuckets.has(key)) revenueBuckets.set(key, (revenueBuckets.get(key) ?? 0) + tx.amountKes);
  }
  const revenue = months.map((month) => ({ month, revenueKes: revenueBuckets.get(month) ?? 0 }));

  const levelCounts = championships.map((c) => ({ level: c.level.replace("_", " "), count: c._count.level }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Platform overview</h1>
        <p className="text-muted">Cross-tenant metrics across the whole Zaroda platform.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Building2 className="h-5 w-5 text-primary" />} label="Tenants" value={tenantCount} />
        <StatCard icon={<Trophy className="h-5 w-5 text-primary" />} label="Championships" value={championshipCount} />
        <StatCard icon={<Users className="h-5 w-5 text-primary" />} label="Participants" value={participantCount} />
        <StatCard
          icon={<Banknote className="h-5 w-5 text-primary" />}
          label="Revenue (6mo, KES)"
          value={paidTransactions.reduce((sum, tx) => sum + tx.amountKes, 0)}
        />
      </div>

      <PanelErrorBoundary fallbackTitle="Charts failed to load">
        <OverviewCharts signups={signups} levelCounts={levelCounts} revenue={revenue} />
      </PanelErrorBoundary>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-navy-light/40">{icon}</div>
        <div>
          <p className="font-mono text-2xl font-bold tabular-nums text-foreground">{value.toLocaleString()}</p>
          <p className="text-sm text-muted">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
