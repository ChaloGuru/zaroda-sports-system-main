import { cn } from "@/lib/utils";

const GENDER_STYLES: Record<string, string> = {
  BOYS: "bg-[#DBEAFE] text-[#1D4ED8]",
  GIRLS: "bg-[#FCE7F3] text-[#BE185D]",
  MIXED: "bg-[#F3E8FF] text-[#7C3AED]",
};

/**
 * Color-coded gender chip (blue/pink/purple) so Boys/Girls/Mixed events and
 * teams are distinguishable at a glance in lists, not just by label text.
 */
export function GenderBadge({ gender, className }: { gender: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[6px] px-2 py-0.5 text-xs font-semibold",
        GENDER_STYLES[gender] ?? "bg-background text-muted",
        className,
      )}
    >
      {gender}
    </span>
  );
}
