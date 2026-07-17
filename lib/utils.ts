import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Level } from "@prisma/client";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export const LEVEL_LABELS: Record<Level, string> = {
  BASE: "Base",
  ZONE: "Zone",
  SUB_COUNTY: "Sub-County",
  COUNTY: "County",
  REGIONAL: "Regional",
  NATIONAL: "National",
  OPEN_TOURNAMENT: "Open Tournament",
};

/**
 * The championship's level must be visible in its own name (so the public
 * can't mistake a free Base-level event for a paid higher-level one just
 * because of how it's titled). Appends " - {Level}" unless a label for this
 * level is already present anywhere in the name.
 */
export function withLevelInName(name: string, level: Level): string {
  const label = LEVEL_LABELS[level];
  const normalized = name.toLowerCase().replace(/-/g, " ");
  if (normalized.includes(label.toLowerCase().replace(/-/g, " "))) return name;
  return `${name.trim()} - ${label}`;
}

/** Ladder order from lowest to highest competition level. */
export const LEVEL_ORDER: Level[] = ["BASE", "ZONE", "SUB_COUNTY", "COUNTY", "REGIONAL", "NATIONAL"];

export function isHigherLevel(candidate: Level, than: Level): boolean {
  return LEVEL_ORDER.indexOf(candidate) > LEVEL_ORDER.indexOf(than);
}

export function formatKes(amountKes: number): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(amountKes);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(d);
}

/**
 * Championship start/end dates are stored as whole-day UTC midnights (e.g. a
 * July 16-17 event has endDate = 2026-07-17T00:00:00Z), so comparing against
 * the exact current instant would drop the event as soon as it ticks past
 * midnight UTC on its own last day. Callers should filter by
 * `startDate < startOfTomorrowUtc && endDate >= startOfTodayUtc` instead, so
 * "today" (in UTC) falling anywhere within [startDate, endDate] counts.
 */
export function todayUtcRange(): { startOfTodayUtc: Date; startOfTomorrowUtc: Date } {
  const now = new Date();
  const startOfTodayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfTomorrowUtc = new Date(startOfTodayUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startOfTodayUtc, startOfTomorrowUtc };
}
