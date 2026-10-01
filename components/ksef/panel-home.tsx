"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PanelErrorBoundary } from "@/components/error-boundary";
import { apiGet } from "@/lib/api-client";
import { KSEF_PANEL_ROLE_LABELS } from "@/lib/ksef-config";
import { MyJudging } from "./my-judging";
import { ReviewsList } from "./reviews-list";
import { ComplaintsPanel } from "./complaints-panel";
import type { KsefPanelRole } from "@prisma/client";

interface Panel {
  role: KsefPanelRole;
  edition: { id: string; name: string; year: number };
}

/**
 * A KSEF panel member's dashboard: their own projects to judge, plus -
 * depending on their role - Chief Judge discrepancy reviews and SRC
 * complaints.
 */
export function PanelHome() {
  const { data, isLoading } = useQuery({
    queryKey: ["ksef-my-panels"],
    queryFn: () => apiGet<{ panels: Panel[] }>("/api/ksef/my-panels"),
  });
  const panels = data?.panels ?? [];
  const [editionId, setEditionId] = React.useState<string | null>(null);
  const panel = panels.find((p) => p.edition.id === editionId) ?? panels[0];

  if (isLoading) return <p className="text-muted">Loading...</p>;

  return (
    <div className="space-y-4">
      {panel && (
        <div className="flex flex-wrap items-center gap-3">
          {panels.length > 1 ? (
            <Select value={panel.edition.id} onValueChange={setEditionId}>
              <SelectTrigger className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {panels.map((p) => (
                  <SelectItem key={p.edition.id} value={p.edition.id}>
                    {p.edition.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="font-semibold text-foreground">{panel.edition.name}</span>
          )}
          <Badge>{KSEF_PANEL_ROLE_LABELS[panel.role]}</Badge>
        </div>
      )}
      <Tabs defaultValue="judging" key={panel?.edition.id}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="judging">My projects</TabsTrigger>
          {panel?.role === "CHIEF_JUDGE" && <TabsTrigger value="reviews">Discrepancy reviews</TabsTrigger>}
          {panel && <TabsTrigger value="complaints">Complaints</TabsTrigger>}
        </TabsList>
        <TabsContent value="judging">
          <PanelErrorBoundary fallbackTitle="Your judging list failed to load">
            <MyJudging />
          </PanelErrorBoundary>
        </TabsContent>
        {panel?.role === "CHIEF_JUDGE" && (
          <TabsContent value="reviews">
            <PanelErrorBoundary fallbackTitle="Reviews failed to load">
              <ReviewsList editionId={panel.edition.id} basePath="/dashboard/ksef-judging/reviews" />
            </PanelErrorBoundary>
          </TabsContent>
        )}
        {panel && (
          <TabsContent value="complaints">
            <PanelErrorBoundary fallbackTitle="Complaints failed to load">
              <ComplaintsPanel editionId={panel.edition.id} canRaise />
            </PanelErrorBoundary>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
