"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { apiPost } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { championshipSchoolsKey } from "@/components/dashboard/schools-panel";

export interface SchoolChoice {
  id: string;
  /** What to show, e.g. "Manyonge (Primary)". */
  name: string;
  /** The school's plain name, without the level. */
  baseName?: string;
  schoolLevel?: string | null;
}

/**
 * Type a school's name: matching schools on the championship's list show as
 * you type, and - when `allowAdd` - a school that isn't on the list can be
 * added there and then (in a Primary/JS championship that adds both its
 * entries; the one for this event is picked).
 */
export function SchoolCombobox({
  championshipId,
  schools,
  value,
  onChange,
  eventLevel,
  allowAdd = false,
  id,
}: {
  championshipId: string;
  schools: SchoolChoice[];
  value: string;
  onChange: (schoolId: string) => void;
  /** The event's school level - after adding, the matching entry is chosen. */
  eventLevel?: string;
  allowAdd?: boolean;
  id?: string;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [pendingName, setPendingName] = React.useState<string | null>(null);
  const selected = schools.find((s) => s.id === value);

  // Show the chosen school's name in the box.
  React.useEffect(() => {
    if (selected) setText(selected.name);
  }, [selected]);

  // After adding, pick the new school once the refreshed list contains it.
  React.useEffect(() => {
    if (!pendingName) return;
    const key = pendingName.trim().toLowerCase();
    const match = schools.find((s) => (s.baseName ?? s.name).trim().toLowerCase() === key && (!eventLevel || !s.schoolLevel || s.schoolLevel === eventLevel));
    if (match) {
      onChange(match.id);
      setPendingName(null);
    }
  }, [schools, pendingName, eventLevel, onChange]);

  const query = text.trim().toLowerCase();
  const matches = (query && !(selected && selected.name.toLowerCase() === query)
    ? schools.filter((s) => s.name.toLowerCase().includes(query))
    : schools
  ).slice(0, 50);
  const exact = schools.some((s) => (s.baseName ?? s.name).trim().toLowerCase() === query || s.name.toLowerCase() === query);
  const canAdd = allowAdd && text.trim().length >= 2 && !exact;

  async function addSchool() {
    const name = text.trim().replace(/\s+/g, " ");
    setAdding(true);
    try {
      await apiPost("/api/championship-schools", { championshipId, names: [name] });
      setPendingName(name);
      await queryClient.invalidateQueries({ queryKey: championshipSchoolsKey(championshipId) });
      toast.success(`${name} added to this championship's schools`);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add the school");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="relative">
      <Input
        id={id}
        className="mt-1.5"
        placeholder="Type the school's name"
        value={text}
        autoComplete="off"
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          if (value) onChange("");
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (matches.length > 0 || canAdd) && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-md">
          {matches.map((s) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(s.id);
                setText(s.name);
                setOpen(false);
              }}
              className={cn("flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-surface-overlay", s.id === value && "font-semibold text-primary")}
            >
              {s.name}
              {s.id === value && <Check className="h-4 w-4" />}
            </button>
          ))}
          {canAdd && (
            <button
              type="button"
              disabled={adding}
              onMouseDown={(e) => e.preventDefault()}
              onClick={addSchool}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-primary hover:bg-surface-overlay"
            >
              <Plus className="h-4 w-4" /> {adding ? "Adding..." : `Add "${text.trim()}" as a new school`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
