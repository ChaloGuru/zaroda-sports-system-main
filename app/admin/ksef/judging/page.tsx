import { NoKsefEdition, KsefPageHeader } from "@/components/ksef/no-edition";
import { JudgingTabs } from "@/components/ksef/judging-tabs";
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
        description="Score sheet progress, judging discrepancy reviews and complaints. Submitted score sheets are permanent and shown read-only."
      />
      <JudgingTabs key={edition.id} edition={toEditionSummary(edition)} />
    </div>
  );
}
