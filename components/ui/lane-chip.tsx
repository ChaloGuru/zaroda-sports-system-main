import * as React from "react";
import { cn } from "@/lib/utils";

export interface LaneChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Bib number, rank, or position to display. */
  value: number | string;
  /**
   * When set to 1, 2, or 3, tints the chip as a medal position
   * (gold/silver/bronze) instead of the default navy tag.
   */
  rank?: number;
  size?: "default" | "lg";
}

const RANK_STYLES: Record<number, string> = {
  1: "bg-[#FBF2DC] text-[#8A6412]",
  2: "bg-[#F0F1F4] text-[#5C6675]",
  3: "bg-[#F6EBE0] text-[#9A5A25]",
};

const DEFAULT_STYLE = "bg-navy text-white";
const OTHER_RANK_STYLE = "bg-background text-muted";

export const LaneChip = React.forwardRef<HTMLSpanElement, LaneChipProps>(
  ({ value, rank, size = "default", className, ...props }, ref) => {
    const rankStyle = rank ? (RANK_STYLES[rank] ?? OTHER_RANK_STYLE) : DEFAULT_STYLE;

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-[6px] font-mono font-semibold tabular-nums",
          size === "lg" ? "min-w-[44px] px-3 py-2 text-base" : "min-w-[34px] px-2 py-1 text-sm",
          rankStyle,
          className,
        )}
        {...props}
      >
        {value}
      </span>
    );
  },
);
LaneChip.displayName = "LaneChip";
