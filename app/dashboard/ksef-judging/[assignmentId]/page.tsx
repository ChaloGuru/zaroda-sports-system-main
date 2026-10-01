import { PanelErrorBoundary } from "@/components/error-boundary";
import { ScoreSheet } from "@/components/ksef/score-sheet";

export default async function KsefScoreSheetPage(props: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await props.params;
  return (
    <PanelErrorBoundary fallbackTitle="Score sheet failed to load">
      <ScoreSheet assignmentId={assignmentId} backHref="/dashboard/ksef-judging" />
    </PanelErrorBoundary>
  );
}
