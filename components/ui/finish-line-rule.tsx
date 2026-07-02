import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A 3px "finish line" rule - dashed lane markings used under section/hero
 * headers as a signature Zaroda Sports visual motif.
 */
export function FinishLineRule({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-[3px] w-full bg-[repeating-linear-gradient(90deg,#2E6BE6_0_20px,transparent_20px_28px)]",
        className,
      )}
    />
  );
}
