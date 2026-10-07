import { prisma } from "./prisma";

// IP rate limiting for public endpoints (sign-in, sign-up, contact form,
// payments, account setup). Counts live in the database (RateLimitHit), so
// every server instance shares them - an in-memory count per instance is
// easy to get around once the site runs on several. If the database can't
// be reached, the per-instance count is used instead, so a database hiccup
// never locks real users out.

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function memoryRateLimit(key: string, limit: number, windowMs: number, now: number): RateLimitResult {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }
  if (existing.count >= limit) return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  existing.count++;
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

/** Counts one request for `key` and says whether it's within `limit` per `windowMs` (fixed windows). */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const resetAt = windowStart.getTime() + windowMs;
  try {
    // One atomic statement, so concurrent requests can't both slip under the limit.
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "rate_limit_hits" ("key", "windowStart", "count") VALUES (${key}, ${windowStart}, 1)
      ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "rate_limit_hits"."count" + 1
      RETURNING "count"`;
    const count = Number(rows[0]?.count ?? 1);
    // Occasional pruning keeps the table small without a separate job.
    if (Math.random() < 0.01) {
      await prisma.rateLimitHit.deleteMany({ where: { windowStart: { lt: new Date(now - 24 * 60 * 60_000) } } });
    }
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt };
  } catch (error) {
    console.warn("[rate-limit] database unavailable, using this instance's count:", error instanceof Error ? error.message : error);
    return memoryRateLimit(key, limit, windowMs, now);
  }
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}
