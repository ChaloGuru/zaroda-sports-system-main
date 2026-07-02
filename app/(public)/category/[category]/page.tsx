import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import type { GameCategory } from "@prisma/client";

export const revalidate = 30;

const CATEGORY_MAP: Record<string, GameCategory> = {
  ball_games: "BALL_GAMES",
  athletics: "ATHLETICS",
  music: "MUSIC",
  other_games: "OTHER_GAMES",
};

const CATEGORY_LABELS: Record<GameCategory, string> = {
  BALL_GAMES: "Ball Games",
  ATHLETICS: "Athletics",
  MUSIC: "Music",
  OTHER_GAMES: "Other Games",
};

export default async function CategoryPage({ params }: { params: { category: string } }) {
  const category = CATEGORY_MAP[params.category];
  if (!category) notFound();

  const championships = await prisma.championship.findMany({
    where: { category, isPublished: true },
    orderBy: { startDate: "desc" },
    include: { tenant: { select: { organizationName: true } }, _count: { select: { games: true } } },
  });

  return (
    <div className="container py-16">
      <h1 className="text-3xl font-bold text-foreground">{CATEGORY_LABELS[category]}</h1>
      <p className="mt-2 text-muted">Published championships in this category, most recent first.</p>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {championships.length === 0 && <p className="text-muted">No published championships yet in this category.</p>}
        {championships.map((c) => (
          <Link key={c.id} href={`/championship/${c.id}`}>
            <Card className="h-full transition-colors hover:border-primary/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">{c.level.replace("_", " ")}</Badge>
                  <Badge variant="outline">{c.schoolLevel.replace("_", " ")}</Badge>
                </div>
                <CardTitle className="mt-2">{c.name}</CardTitle>
                <CardDescription>{c.tenant.organizationName}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted">
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> {c.location}, {c.county}
                </p>
                <p className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> {formatDate(c.startDate)} - {formatDate(c.endDate)}
                </p>
                <p>{c._count.games} games</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
