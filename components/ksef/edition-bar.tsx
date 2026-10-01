"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEVEL_LABELS } from "@/lib/utils";
import { EDITION_STATUS_BADGE, type KsefEditionSummary } from "./types";

// Must match KSEF_EDITION_COOKIE in lib/ksef.ts (not imported - that module is server-only).
const COOKIE = "ksef_edition";

/** "Select Competition" - which KSEF edition every KSEF page is showing. */
export function KsefEditionBar({ editions, selected }: { editions: KsefEditionSummary[]; selected: KsefEditionSummary | null }) {
  const router = useRouter();

  function select(id: string) {
    document.cookie = `${COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  }

  if (!selected) return null;

  return (
    <div className="no-print flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface-raised px-4 py-3">
      <span className="text-sm font-medium text-muted">Select Competition</span>
      <Select value={selected.id} onValueChange={select}>
        <SelectTrigger className="h-9 w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {editions.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Badge variant={EDITION_STATUS_BADGE[selected.status]}>{selected.status.toLowerCase()}</Badge>
      <span className="text-sm text-muted">
        Current level: <span className="font-semibold text-foreground">{LEVEL_LABELS[selected.currentLevel]}</span>
      </span>
      {selected.status === "CLOSED" && <span className="text-xs text-muted">Closed editions are read-only.</span>}
    </div>
  );
}
