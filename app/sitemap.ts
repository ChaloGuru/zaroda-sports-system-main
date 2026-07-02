import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

const BASE_URL = "https://zarodasports.live";

export const revalidate = 3600;

const staticRoutes: MetadataRoute.Sitemap = [
  { url: `${BASE_URL}/`, changeFrequency: "weekly", priority: 1.0 },
  { url: `${BASE_URL}/pricing`, changeFrequency: "monthly", priority: 0.8 },
  { url: `${BASE_URL}/rankings`, changeFrequency: "daily", priority: 0.7 },
  { url: `${BASE_URL}/medal-table`, changeFrequency: "daily", priority: 0.7 },
  { url: `${BASE_URL}/circulars`, changeFrequency: "weekly", priority: 0.6 },
  { url: `${BASE_URL}/contacts`, changeFrequency: "monthly", priority: 0.5 },
  { url: `${BASE_URL}/signup`, changeFrequency: "monthly", priority: 0.6 },
  { url: `${BASE_URL}/login`, changeFrequency: "yearly", priority: 0.3 },
  { url: `${BASE_URL}/category/ball_games`, changeFrequency: "weekly", priority: 0.7 },
  { url: `${BASE_URL}/category/athletics`, changeFrequency: "weekly", priority: 0.7 },
  { url: `${BASE_URL}/category/music`, changeFrequency: "weekly", priority: 0.7 },
  { url: `${BASE_URL}/category/other_games`, changeFrequency: "weekly", priority: 0.7 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [championships, games] = await Promise.all([
    prisma.championship.findMany({
      where: { isPublished: true },
      select: { id: true, updatedAt: true },
    }),
    prisma.game.findMany({
      where: { championship: { isPublished: true } },
      select: { id: true, updatedAt: true },
    }),
  ]);

  const championshipEntries: MetadataRoute.Sitemap = championships.map((c) => ({
    url: `${BASE_URL}/championship/${c.id}`,
    lastModified: c.updatedAt,
    changeFrequency: "daily",
    priority: 0.6,
  }));

  const gameEntries: MetadataRoute.Sitemap = games.map((g) => ({
    url: `${BASE_URL}/game/${g.id}`,
    lastModified: g.updatedAt,
    changeFrequency: "daily",
    priority: 0.5,
  }));

  return [...staticRoutes, ...championshipEntries, ...gameEntries];
}
