import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export interface CaseEvent {
  id: string;
  action: string;
  note: string | null;
  actor: string;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  DETECTED: "Discrepancy detected",
  NOTE: "Note",
  APPROVED: "Final result approved",
  REOPENED: "Reopened",
  RAISED: "Complaint raised",
  UNDER_REVIEW: "Taken up by the SRC",
  UPHELD: "Upheld by the SRC",
  DISMISSED: "Dismissed by the SRC",
};

/** The permanent, append-only history of a review or complaint. */
export function CaseTimeline({ events }: { events: CaseEvent[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
        <CardDescription>Every action is recorded here permanently and can&apos;t be edited or deleted.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3 border-l border-border pl-4">
          {events.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
              <p className="text-sm font-semibold text-foreground">
                {ACTION_LABELS[e.action] ?? e.action}
                <span className="ml-2 font-normal text-muted">
                  {e.actor} · {new Date(e.createdAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </p>
              {e.note && <p className="whitespace-pre-line text-sm text-foreground">{e.note}</p>}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
