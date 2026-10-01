import { PanelErrorBoundary } from "@/components/error-boundary";
import { KsefPageHeader } from "@/components/ksef/no-edition";
import { CompetitionsManager } from "@/components/ksef/competitions-manager";

export default function KsefCompetitionsPage() {
  return (
    <div className="space-y-6">
      <KsefPageHeader
        title="Competitions"
        description="Create a KSEF edition for each competition year, then activate it and close it when the year is done."
      />
      <PanelErrorBoundary fallbackTitle="Competitions failed to load">
        <CompetitionsManager />
      </PanelErrorBoundary>
    </div>
  );
}
