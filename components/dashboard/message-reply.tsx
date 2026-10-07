"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CornerDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiPost } from "@/lib/api-client";

/** Replies to a message from Zaroda; the reply goes back to whoever sent it. */
export function MessageReply({ messageId, subject }: { messageId: string; subject: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [body, setBody] = React.useState("");
  const [sending, setSending] = React.useState(false);

  async function send() {
    setSending(true);
    try {
      await apiPost("/api/messages", { parentId: messageId, subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`, body });
      toast.success("Reply sent");
      setOpen(false);
      setBody("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send your reply");
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="ghost" className="mt-2" onClick={() => setOpen(true)}>
        <CornerDownRight className="h-4 w-4" /> Reply
      </Button>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Your reply to Zaroda" maxLength={5000} />
      <div className="flex gap-2">
        <Button size="sm" disabled={!body.trim() || sending} onClick={send}>
          {sending ? "Sending..." : "Send reply"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}
