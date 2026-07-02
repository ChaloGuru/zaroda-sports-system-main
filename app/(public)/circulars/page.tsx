import { FileText, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SanitizedHtml } from "@/components/sanitized-html";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export const revalidate = 30;

async function getCirculars() {
  return prisma.circular.findMany({ where: { isPublished: true }, orderBy: { createdAt: "desc" } });
}

export default async function CircularsPage() {
  const circulars = await getCirculars();

  return (
    <div className="container py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-bold text-foreground">Circulars &amp; Announcements</h1>
        <p className="mt-3 text-muted">Official communications from the platform and championship administrators.</p>
      </div>

      <div className="mx-auto mt-10 max-w-3xl space-y-6">
        {circulars.length === 0 && (
          <p className="text-center text-muted">No circulars have been published yet.</p>
        )}
        {circulars.map((circular) => (
          <Card key={circular.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" /> {circular.title}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted">
                    {circular.senderName} - {circular.senderRole} - {formatDate(circular.createdAt)}
                  </p>
                </div>
                <Badge variant="secondary">{circular.targetLevel}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <SanitizedHtml html={circular.content} className="prose-circular" />
              {circular.documentUrl && (
                <a
                  href={circular.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                >
                  <Download className="h-4 w-4" /> Download attachment
                </a>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
