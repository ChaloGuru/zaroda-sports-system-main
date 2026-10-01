import { PanelHome } from "@/components/ksef/panel-home";

export default function KsefJudgingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">KSEF Judging</h1>
        <p className="text-muted">Kenya Science and Engineering Fair judging, reviews and complaints.</p>
      </div>
      <PanelHome />
    </div>
  );
}
