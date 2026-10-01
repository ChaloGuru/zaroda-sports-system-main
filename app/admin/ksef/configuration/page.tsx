import { PanelErrorBoundary } from "@/components/error-boundary";
import { NoKsefEdition, KsefPageHeader } from "@/components/ksef/no-edition";
import { ConfigurationManager } from "@/components/ksef/configuration-manager";
import { toEditionSummary } from "@/components/ksef/types";
import { resolveSelectedEdition } from "@/lib/ksef";

export const dynamic = "force-dynamic";

export default async function KsefConfigurationPage() {
  const edition = await resolveSelectedEdition();
  if (!edition) return <NoKsefEdition />;

  return (
    <div className="space-y-6">
      <KsefPageHeader
        title={`${edition.name} configuration`}
        description="Categories, sub-categories and judging criteria for this edition only - other years are unaffected."
      />
      <PanelErrorBoundary fallbackTitle="Configuration failed to load">
        <ConfigurationManager key={edition.id} edition={toEditionSummary(edition)} />
      </PanelErrorBoundary>
    </div>
  );
}
