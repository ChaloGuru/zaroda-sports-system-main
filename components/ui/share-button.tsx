"use client";

import * as React from "react";
import { Share2, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ShareButton({
  title,
  message,
  url,
  label = "Share results",
  copiedMessage = "Link and message copied - paste it anywhere to share",
}: {
  title: string;
  message: string;
  url: string;
  /** Button text - defaults to "Share results"; pass e.g. "Share reg link" for other contexts. */
  label?: string;
  /** Toast text shown after a successful copy (native share fallback or the explicit copy button). */
  copiedMessage?: string;
}) {
  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text: message, url });
      } catch {
        // AbortError when the user cancels the native share sheet - not an error.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(`${message}`);
      toast.success(copiedMessage);
    } catch {
      toast.error("Couldn't copy the share message");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Couldn't copy the link");
    }
  }

  return (
    <div className="no-print flex items-center gap-1">
      <Button variant="secondary" size="sm" onClick={share}>
        <Share2 className="h-4 w-4" /> {label}
      </Button>
      <Button variant="secondary" size="icon" onClick={copyLink} title="Copy link" aria-label="Copy link">
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}
