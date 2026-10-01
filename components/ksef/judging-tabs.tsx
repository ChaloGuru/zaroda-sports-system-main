"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PanelErrorBoundary } from "@/components/error-boundary";
import { JudgingOverview } from "./judging-overview";
import { ReviewsList } from "./reviews-list";
import { ComplaintsPanel } from "./complaints-panel";
import type { KsefEditionSummary } from "./types";

/** The KSEF administrator's Judging page: progress, discrepancy reviews and complaints. */
export function JudgingTabs({ edition }: { edition: KsefEditionSummary }) {
  return (
    <Tabs defaultValue="progress">
      <TabsList className="flex-wrap">
        <TabsTrigger value="progress">Progress</TabsTrigger>
        <TabsTrigger value="reviews">Discrepancy reviews</TabsTrigger>
        <TabsTrigger value="complaints">Complaints</TabsTrigger>
      </TabsList>
      <TabsContent value="progress">
        <PanelErrorBoundary fallbackTitle="Judging progress failed to load">
          <JudgingOverview edition={edition} />
        </PanelErrorBoundary>
      </TabsContent>
      <TabsContent value="reviews">
        <PanelErrorBoundary fallbackTitle="Reviews failed to load">
          <ReviewsList editionId={edition.id} basePath="/admin/ksef/judging/reviews" />
        </PanelErrorBoundary>
      </TabsContent>
      <TabsContent value="complaints">
        <PanelErrorBoundary fallbackTitle="Complaints failed to load">
          <ComplaintsPanel editionId={edition.id} canRaise={edition.status !== "CLOSED"} />
        </PanelErrorBoundary>
      </TabsContent>
    </Tabs>
  );
}
