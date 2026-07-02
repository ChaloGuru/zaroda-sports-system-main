import Link from "next/link";
import { redirect } from "next/navigation";
import { Trophy, Users, CreditCard, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAuthContext } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export default async function DashboardOverviewPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const isSuperAdmin = ctx.roles.some((r) => r.role === "SUPER_ADMIN");
  if (isSuperAdmin) redirect("/admin");

  if (!ctx.tenantId) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-muted">
          Your account does not have a tenant profile. If you were invited as an official or scorekeeper, use the
          link shared with you to access your assigned championship directly.
        </p>
      </div>
    );
  }

  const [tenant, championships, activeSubscriptions] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: ctx.tenantId } }),
    prisma.championship.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { games: true, participants: true } } },
    }),
    prisma.championshipSubscription.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE", expiresAt: { gt: new Date() } },
      include: { plan: true },
    }),
  ]);

  const totalParticipants = championships.reduce((sum, c) => sum + c._count.participants, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Welcome back, {tenant?.organizationName}</h1>
        <p className="text-muted">Here's what's happening across your championships.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={<Trophy className="h-5 w-5 text-primary" />} label="Championships" value={championships.length} />
        <StatCard icon={<Users className="h-5 w-5 text-primary" />} label="Total participants" value={totalParticipants} />
        <StatCard
          icon={<CreditCard className="h-5 w-5 text-primary" />}
          label="Active subscriptions"
          value={activeSubscriptions.length}
        />
      </div>

      {activeSubscriptions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active subscriptions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeSubscriptions.map((sub) => (
              <div key={sub.id} className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <p className="font-medium text-foreground">{sub.plan.displayName}</p>
                  <p className="text-sm text-muted">Expires {sub.expiresAt ? formatDate(sub.expiresAt) : "-"}</p>
                </div>
                <Badge variant="success">Active</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Your championships</CardTitle>
            <CardDescription>Base level is always free - upgrade any championship any time.</CardDescription>
          </div>
          <Button asChild size="sm">
            <Link href="/dashboard/championships/new">New championship</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {championships.length === 0 && <p className="text-muted">You haven't created a championship yet.</p>}
          {championships.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/championships/${c.id}`}
              className="flex items-center justify-between rounded-md border border-border p-4 transition-colors hover:border-primary/50"
            >
              <div>
                <p className="font-medium text-foreground">{c.name}</p>
                <p className="text-sm text-muted">
                  {c.level.replace("_", " ")} - {c._count.games} games - {c._count.participants} participants
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={c.isPublished ? "success" : "outline"}>{c.isPublished ? "Published" : "Draft"}</Badge>
                <ArrowRight className="h-4 w-4 text-muted" />
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-navy-light/40">{icon}</div>
        <div>
          <p className="font-mono text-2xl font-bold tabular-nums text-foreground">{value}</p>
          <p className="text-sm text-muted">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
