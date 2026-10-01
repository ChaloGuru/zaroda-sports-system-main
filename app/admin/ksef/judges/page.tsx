import { PanelErrorBoundary } from "@/components/error-boundary";
import { NoKsefEdition, KsefPageHeader } from "@/components/ksef/no-edition";
import { JudgesManager } from "@/components/ksef/judges-manager";
import { toEditionSummary } from "@/components/ksef/types";
import { resolveSelectedEdition } from "@/lib/ksef";

export const dynamic = "force-dynamic";

export default async function KsefJudgesPage() {
  const edition = await resolveSelectedEdition();
  if (!edition) return <NoKsefEdition />;

  return (
    <div className="space-y-6">
      <KsefPageHeader title="Judges" description={`${edition.name} judging panel and project assignments.`} />
      <PanelErrorBoundary fallbackTitle="Judges failed to load">
        <JudgesManager key={edition.id} edition={toEditionSummary(edition)} />
      </PanelErrorBoundary>
    </div>
  );
}
