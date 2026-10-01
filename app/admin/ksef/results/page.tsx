import { PanelErrorBoundary } from "@/components/error-boundary";
import { NoKsefEdition, KsefPageHeader } from "@/components/ksef/no-edition";
import { ResultsManager } from "@/components/ksef/results-manager";
import { toEditionSummary } from "@/components/ksef/types";
import { resolveSelectedEdition } from "@/lib/ksef";

export const dynamic = "force-dynamic";

export default async function KsefResultsPage() {
  const edition = await resolveSelectedEdition();
  if (!edition) return <NoKsefEdition />;

  return (
    <div className="space-y-6">
      <KsefPageHeader title="Results" description={`${edition.name} scores, rankings, qualification and progression.`} />
      <PanelErrorBoundary fallbackTitle="Results failed to load">
        <ResultsManager key={`${edition.id}:${edition.currentLevel}`} edition={toEditionSummary(edition)} />
      </PanelErrorBoundary>
    </div>
  );
}
