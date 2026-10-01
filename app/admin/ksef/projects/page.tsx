import { PanelErrorBoundary } from "@/components/error-boundary";
import { NoKsefEdition, KsefPageHeader } from "@/components/ksef/no-edition";
import { ProjectsManager } from "@/components/ksef/projects-manager";
import { toEditionSummary } from "@/components/ksef/types";
import { resolveSelectedEdition } from "@/lib/ksef";

export const dynamic = "force-dynamic";

export default async function KsefProjectsPage() {
  const edition = await resolveSelectedEdition();
  if (!edition) return <NoKsefEdition />;

  return (
    <div className="space-y-6">
      <KsefPageHeader title="Projects" description={`Projects entered in ${edition.name}.`} />
      <PanelErrorBoundary fallbackTitle="Projects failed to load">
        <ProjectsManager key={edition.id} edition={toEditionSummary(edition)} />
      </PanelErrorBoundary>
    </div>
  );
}
