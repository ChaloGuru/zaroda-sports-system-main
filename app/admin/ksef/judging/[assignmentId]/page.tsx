import { PanelErrorBoundary } from "@/components/error-boundary";
import { ScoreSheet } from "@/components/ksef/score-sheet";

export default async function KsefAdminScoreSheetPage(props: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await props.params;
  return (
    <PanelErrorBoundary fallbackTitle="Score sheet failed to load">
      <ScoreSheet assignmentId={assignmentId} backHref="/admin/ksef/judging" />
    </PanelErrorBoundary>
  );
}
