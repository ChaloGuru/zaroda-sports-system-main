"use client";

import * as React from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ShareButton({ title, message, url }: { title: string; message: string; url: string }) {
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
      toast.success("Results link and message copied - paste it anywhere to share");
    } catch {
      toast.error("Couldn't copy the share message");
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={share} className="no-print">
      <Share2 className="h-4 w-4" /> Share results
    </Button>
  );
}
