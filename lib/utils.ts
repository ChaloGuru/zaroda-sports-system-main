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
};

/**
 * The championship's level must be visible in its own name (so the public
 * can't mistake a free Base-level event for a paid higher-level one just
 * because of how it's titled). Appends " - {Level}" unless a label for this
 * level is already present anywhere in the name.
 */
export function withLevelInName(name: string, level: Level): string {
  const label = LEVEL_LABELS[level];
  if (name.toLowerCase().includes(label.toLowerCase())) return name;
  return `${name.trim()} - ${label}`;
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
