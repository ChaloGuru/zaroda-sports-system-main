import { PanelErrorBoundary } from "@/components/error-boundary";
import { MyJudging } from "@/components/ksef/my-judging";

export default function KsefJudgingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">KSEF Judging</h1>
        <p className="text-muted">Score the Kenya Science and Engineering Fair projects assigned to you.</p>
      </div>
      <PanelErrorBoundary fallbackTitle="Your judging list failed to load">
        <MyJudging />
      </PanelErrorBoundary>
    </div>
  );
}
