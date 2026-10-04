import { PanelErrorBoundary } from "@/components/error-boundary";
import { NoKsefEdition, KsefPageHeader } from "@/components/ksef/no-edition";
import { SchoolRegistrations } from "@/components/ksef/school-registrations";
import { SchoolsManager } from "@/components/ksef/schools-manager";
import { toEditionSummary } from "@/components/ksef/types";
import { resolveSelectedEdition } from "@/lib/ksef";

export const dynamic = "force-dynamic";

export default async function KsefSchoolsPage() {
  const edition = await resolveSelectedEdition();
  if (!edition) return <NoKsefEdition />;

  return (
    <div className="space-y-6">
      <KsefPageHeader title="Schools" description={`Schools taking part in ${edition.name}.`} />
      <PanelErrorBoundary fallbackTitle="School registrations failed to load">
        <SchoolRegistrations key={edition.id} edition={toEditionSummary(edition)} />
      </PanelErrorBoundary>
      <PanelErrorBoundary fallbackTitle="Schools failed to load">
        <SchoolsManager key={edition.id} edition={toEditionSummary(edition)} />
      </PanelErrorBoundary>
    </div>
  );
}
