import { redirect } from "next/navigation";
import { Inbox, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SanitizedHtml } from "@/components/sanitized-html";
import { getAuthContext } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export default async function DashboardMessagesPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const [messages, circulars] = await Promise.all([
    prisma.adminMessage.findMany({
      where: { OR: [{ recipientId: ctx.userId }, { senderId: ctx.userId }, { isBroadcast: true }] },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { sender: { select: { name: true } } },
    }),
    prisma.circular.findMany({ where: { isPublished: true }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Messages &amp; Circulars</h1>
        <p className="text-muted">Platform announcements and direct messages.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Inbox className="h-5 w-5 text-primary" /> Inbox</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {messages.length === 0 && <p className="text-muted">No messages yet.</p>}
          {messages.map((m) => (
            <div key={m.id} className="rounded-md border border-border p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-foreground">{m.subject}</p>
                {m.isBroadcast && <Badge variant="warning">Broadcast</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted">From {m.sender.name} - {formatDate(m.createdAt)}</p>
              <p className="mt-2 text-sm text-foreground">{m.body}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Recent circulars</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {circulars.length === 0 && <p className="text-muted">No circulars published yet.</p>}
          {circulars.map((c) => (
            <div key={c.id} className="rounded-md border border-border p-4">
              <p className="font-medium text-foreground">{c.title}</p>
              <p className="mt-1 text-sm text-muted">{c.senderName} - {formatDate(c.createdAt)}</p>
              <SanitizedHtml html={c.content} className="prose-circular mt-2" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
