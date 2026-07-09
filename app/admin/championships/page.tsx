import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { DownloadReceiptButton } from "@/components/payments/download-receipt-button";

export default async function AdminChampionshipsPage() {
  const championships = await prisma.championship.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      tenant: { select: { organizationName: true } },
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
          <h1 className="text-2xl font-bold text-foreground">All championships</h1>
          <p className="text-muted">Across every tenant on the platform. Super admins create championships free of charge.</p>
        </div>
        <Button asChild>
          <Link href="/admin/championships/new"><Plus className="h-4 w-4" /> New championship</Link>
        </Button>
      </div>

      <div className="grid gap-4">
        {championships.map((c) => (
          <Link key={c.id} href={`/dashboard/championships/${c.id}`}>
            <Card className="transition-colors hover:border-primary/50">
              <CardContent className="flex items-center justify-between py-5">
                <div>
                  <p className="font-medium text-foreground">{c.name}</p>
                  <p className="text-sm text-muted">
                    {c.tenant.organizationName} - {c.county} - {formatDate(c.startDate)} - {c._count.games} games
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
        {championships.length === 0 && <p className="text-muted">No championships created yet.</p>}
      </div>
    </div>
  );
}
