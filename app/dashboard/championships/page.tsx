import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAuthContext, isSuperAdmin } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { DownloadReceiptButton } from "@/components/payments/download-receipt-button";

export default async function DashboardChampionshipsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  // A super admin has no tenant of their own - championships they create are
  // attached to whichever tenant they picked, so "my tenant's championships"
  // doesn't apply to them. Send them to the platform-wide list instead of
  // silently redirecting to an empty /dashboard (the previous behavior, which
  // made super-admin-created championships appear to simply vanish).
  if (isSuperAdmin(ctx)) redirect("/admin/championships");
  if (!ctx.tenantId) redirect("/dashboard");

  const championships = await prisma.championship.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { games: true, participants: true } },
      subscriptions: {
        where: { paidAt: { not: null }, paystackReference: { not: null } },
        orderBy: { paidAt: "desc" },
        take: 1,
        select: { paystackReference: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Championships</h1>
          <p className="text-muted">Manage every championship your organization runs.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/championships/new">
            <Plus className="h-4 w-4" /> New championship
          </Link>
        </Button>
      </div>

      <div className="grid gap-4">
        {championships.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-muted">
              No championships yet. Create your first free Base championship to get started.
            </CardContent>
          </Card>
        )}
        {championships.map((c) => (
          <Link key={c.id} href={`/dashboard/championships/${c.id}`}>
            <Card className="transition-colors hover:border-primary/50">
              <CardContent className="flex items-center justify-between py-5">
                <div>
                  <p className="font-medium text-foreground">{c.name}</p>
                  <p className="text-sm text-muted">
                    {c.category.replace("_", " ")} - {c.county} - {formatDate(c.startDate)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{c.level.replace("_", " ")}</Badge>
                  <Badge variant={c.isPublished ? "success" : "outline"}>{c.isPublished ? "Published" : "Draft"}</Badge>
                  {c.subscriptions[0]?.paystackReference && (
                    <DownloadReceiptButton reference={c.subscriptions[0].paystackReference} />
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
