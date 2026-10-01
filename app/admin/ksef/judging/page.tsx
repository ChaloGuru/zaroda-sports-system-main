import { PanelErrorBoundary } from "@/components/error-boundary";
import { NoKsefEdition, KsefPageHeader } from "@/components/ksef/no-edition";
import { JudgingOverview } from "@/components/ksef/judging-overview";
import { toEditionSummary } from "@/components/ksef/types";
import { resolveSelectedEdition } from "@/lib/ksef";

export const dynamic = "force-dynamic";

export default async function KsefJudgingOverviewPage() {
  const edition = await resolveSelectedEdition();
  if (!edition) return <NoKsefEdition />;

  return (
    <div className="space-y-6">
      <KsefPageHeader
        title="Judging"
        description="Track score sheets per project. Click a judge's name to open their sheet - e.g. to enter a paper score sheet."
      />
      <PanelErrorBoundary fallbackTitle="Judging failed to load">
        <JudgingOverview key={edition.id} edition={toEditionSummary(edition)} />
      </PanelErrorBoundary>
    </div>
  );
}
