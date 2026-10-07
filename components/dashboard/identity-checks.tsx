"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, FileText, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiPatch, apiPost } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { idDocumentLabel } from "@/lib/learner-documents";
import { LearnerPhoto, ageFrom, idNumbersLine, learnerDocumentUrl } from "@/components/dashboard/learner-photo";

/*
 * What officials use against a learner competing on someone else's details:
 * challenges (the learner is held back until a tournament admin decides),
 * identity alerts (records that don't add up across championships and
 * seasons - see lib/identity-checks.ts) and "original documents seen".
 */

export interface ChallengeRow {
  id: string;
  reason: string;
  status: "OPEN" | "CLEARED" | "UPHELD";
  raisedBy: string;
  resolution?: string | null;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
}

type Difference = "name" | "dateOfBirth" | "gender" | "birthCertNumber" | "knecAssessmentNumber" | "kemisUpi";

export interface IdentityAlertRow {
  id: string;
  kind: "ID_MISMATCH" | "DIFFERENT_FACE" | "SAME_FACE";
  details: { shared?: Difference[]; differences?: Difference[]; distance?: number };
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  learnerId: string;
  other: {
    learnerId: string | null;
    sameChampionship: boolean;
    sameOrganiser: boolean;
    championshipName: string | null;
    year: number;
    name: string | null;
    dateOfBirth: string | null;
    schoolName: string | null;
    birthCertNumber: string | null;
    knecAssessmentNumber: string | null;
    kemisUpi: string | null;
    photoUpdatedAt: string | null;
    idDocumentUpdatedAt: string | null;
  };
}

const DIFFERENCE_LABELS: Record<Difference, string> = {
  name: "name",
  dateOfBirth: "date of birth",
  gender: "gender",
  birthCertNumber: "birth certificate no.",
  knecAssessmentNumber: "KNEC assessment no.",
  kemisUpi: "KEMIS UPI",
};

function list(items: Difference[] | undefined): string {
  const labels = (items ?? []).map((d) => DIFFERENCE_LABELS[d]);
  return labels.length <= 1 ? (labels[0] ?? "") : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

/** One line on what an alert means, for officials. */
export function alertHeadline(alert: IdentityAlertRow): string {
  const where = alert.other.sameChampionship
    ? "another learner in this championship"
    : alert.other.sameOrganiser
      ? `a learner in ${alert.other.championshipName} (${alert.other.year})`
      : `a learner in another organiser's championship (${alert.other.year})`;
  switch (alert.kind) {
    case "ID_MISMATCH":
      return `Same ${list(alert.details.shared)} as ${where}, but a different ${list(alert.details.differences)}.`;
    case "DIFFERENT_FACE":
      return `Same ${list(alert.details.shared)} as ${where}, but the photos look like different children.`;
    case "SAME_FACE":
      return `The photo looks like the same child as ${where}, registered with a different ${list(alert.details.differences)}.`;
  }
}

/** An official challenges a learner's age or identity - they're held back until a tournament admin decides. */
export function ChallengeDialog({
  learner,
  suggestedReason,
  onClose,
  onDone,
}: {
  learner: { id: string; name: string };
  suggestedReason?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = React.useState(suggestedReason ?? "");
  const raise = useMutation({
    mutationFn: () => apiPost(`/api/learners/${learner.id}/challenges`, { reason }),
    onSuccess: () => {
      toast.success(`${learner.name} is held back until a tournament admin resolves the challenge`);
      onDone();
      onClose();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't raise the challenge"),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Challenge {learner.name}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted">
          Use this when you doubt the learner&apos;s age or identity. They can&apos;t be checked in for any event (any check-in
          is undone) until a tournament admin has seen the original documents and cleared or upheld the challenge. Their
          school sees the challenge.
        </p>
        <div>
          <Label htmlFor="challenge-reason">Why</Label>
          <Textarea
            id="challenge-reason"
            className="mt-1.5"
            rows={4}
            placeholder="e.g. Looks much older than 13; could not say their date of birth; another school says he is in Grade 9"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <Button variant="destructive" className="w-full" disabled={reason.trim().length < 5 || raise.isPending} onClick={() => raise.mutate()}>
          <ShieldAlert className="h-4 w-4" /> {raise.isPending ? "Raising..." : "Raise challenge"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/** A tournament admin's decision on a challenge, after seeing the originals. */
export function ResolveChallengeDialog({
  challenge,
  learnerName,
  onClose,
  onDone,
}: {
  challenge: ChallengeRow;
  learnerName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [status, setStatus] = React.useState<"CLEARED" | "UPHELD">("CLEARED");
  const [resolution, setResolution] = React.useState("");
  const resolve = useMutation({
    mutationFn: () => apiPatch(`/api/learner-challenges/${challenge.id}`, { status, resolution }),
    onSuccess: () => {
      toast.success(status === "CLEARED" ? `${learnerName} is cleared to compete` : `${learnerName} is disqualified from all events`);
      onDone();
      onClose();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't resolve the challenge"),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve the challenge to {learnerName}</DialogTitle>
        </DialogHeader>
        <p className="rounded-md bg-secondary p-3 text-sm text-foreground">
          {challenge.reason}
          <span className="mt-1 block text-xs text-muted">
            Raised by {challenge.raisedBy} on {formatDate(challenge.createdAt)}
          </span>
        </p>
        <div className="space-y-2 text-sm">
          <label className="flex items-start gap-2">
            <input type="radio" name="decision" checked={status === "CLEARED"} onChange={() => setStatus("CLEARED")} className="mt-1" />
            <span>
              <span className="font-medium text-foreground">Clear</span> - the original documents match the learner; they
              can be checked in.
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="decision" checked={status === "UPHELD"} onChange={() => setStatus("UPHELD")} className="mt-1" />
            <span>
              <span className="font-medium text-foreground">Uphold</span> - the learner isn&apos;t who the record says or is
              over age; every one of their entries is disqualified.
            </span>
          </label>
        </div>
        <div>
          <Label htmlFor="challenge-resolution">What was checked and decided</Label>
          <Textarea
            id="challenge-resolution"
            className="mt-1.5"
            rows={3}
            placeholder="e.g. Original birth certificate and KNEC slip seen, head teacher present - matches"
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
          />
        </div>
        <Button
          variant={status === "UPHELD" ? "destructive" : "default"}
          className="w-full"
          disabled={resolution.trim().length < 5 || resolve.isPending}
          onClick={() => resolve.mutate()}
        >
          {resolve.isPending ? "Saving..." : status === "CLEARED" ? "Clear the learner" : "Uphold and disqualify"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/** Marks an identity alert as looked into, with what was found - or reopens it. */
function ReviewAlertDialog({ alert, onClose, onDone }: { alert: IdentityAlertRow; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = React.useState("");
  const review = useMutation({
    mutationFn: () => apiPatch(`/api/learner-identity-alerts/${alert.id}`, { reviewNote: note }),
    onSuccess: () => {
      toast.success("Alert marked as reviewed");
      onDone();
      onClose();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't save the review"),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as reviewed</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted">{alertHeadline(alert)}</p>
        <div>
          <Label htmlFor="alert-note">What you found</Label>
          <Textarea
            id="alert-note"
            className="mt-1.5"
            rows={3}
            placeholder="e.g. Twins - both birth certificates seen; or: typing mistake in the date of birth, corrected"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <Button className="w-full" disabled={note.trim().length < 5 || review.isPending} onClick={() => review.mutate()}>
          {review.isPending ? "Saving..." : "Mark as reviewed"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

interface AlertLearner {
  id: string;
  firstName: string;
  lastName: string;
  bibNumber: number;
  dateOfBirth: string | null;
  birthCertNumber: string | null;
  knecAssessmentNumber?: string | null;
  kemisUpi?: string | null;
  photoUpdatedAt: string | null;
  idDocumentUpdatedAt?: string | null;
  school?: { name: string } | null;
}

function RecordSide({
  title,
  photo,
  name,
  lines,
  documentUrl,
}: {
  title: string;
  photo: { learnerId: string | null; photoUpdatedAt: string | null };
  name: string;
  lines: string[];
  documentUrl: string | null;
}) {
  return (
    <div className="flex flex-1 items-start gap-3 rounded-md border border-border bg-surface p-3">
      <LearnerPhoto learnerId={photo.learnerId} photoUpdatedAt={photo.photoUpdatedAt} name={name} className="h-20 w-20" />
      <div className="min-w-0 text-xs text-muted">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</p>
        <p className="text-sm font-medium text-foreground">{name}</p>
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {documentUrl && (
          <a className="mt-1 inline-flex items-center gap-1 text-primary underline" href={documentUrl} target="_blank" rel="noreferrer">
            <FileText className="h-3.5 w-3.5" /> Document
          </a>
        )}
      </div>
    </div>
  );
}

/** One identity alert: the two records side by side, and what to do about it. */
export function IdentityAlertCard({
  alert,
  learner,
  onChallenge,
  onChanged,
}: {
  alert: IdentityAlertRow;
  learner: AlertLearner;
  onChallenge: (reason: string) => void;
  onChanged: () => void;
}) {
  const [reviewing, setReviewing] = React.useState(false);
  const reopen = useMutation({
    mutationFn: () => apiPatch(`/api/learner-identity-alerts/${alert.id}`, { reviewNote: null }),
    onSuccess: onChanged,
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't reopen the alert"),
  });
  const name = `${learner.firstName} ${learner.lastName}`;
  const other = alert.other;
  const otherLines = other.sameOrganiser
    ? [
        other.schoolName ?? "No school",
        other.dateOfBirth ? `Born ${formatDate(other.dateOfBirth)} (age ${ageFrom(other.dateOfBirth)})` : "No date of birth",
        idNumbersLine(other),
        other.sameChampionship ? "This championship" : `${other.championshipName} (${other.year})`,
      ]
    : [`Another organiser's championship (${other.year})`, "Their details are private to them - check the learner's originals."];

  return (
    <div className="space-y-3 rounded-md border border-[#F0B429]/60 bg-[#F0B429]/10 p-4">
      <p className="text-sm font-medium text-foreground">
        <ShieldAlert className="mr-1 inline h-4 w-4 text-[#B45309]" />
        {name} (bib {learner.bibNumber}): {alertHeadline(alert)}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <RecordSide
          title="This record"
          photo={{ learnerId: learner.id, photoUpdatedAt: learner.photoUpdatedAt }}
          name={name}
          lines={[
            learner.school?.name ?? "No school",
            learner.dateOfBirth ? `Born ${formatDate(learner.dateOfBirth)} (age ${ageFrom(learner.dateOfBirth)})` : "No date of birth",
            idNumbersLine(learner),
          ]}
          documentUrl={learner.idDocumentUpdatedAt ? learnerDocumentUrl(learner.id, learner.idDocumentUpdatedAt) : null}
        />
        <RecordSide
          title="Other record"
          photo={{ learnerId: other.learnerId, photoUpdatedAt: other.photoUpdatedAt }}
          name={other.name ?? "Learner"}
          lines={otherLines}
          documentUrl={other.learnerId && other.idDocumentUpdatedAt ? learnerDocumentUrl(other.learnerId, other.idDocumentUpdatedAt) : null}
        />
      </div>
      {alert.reviewedAt ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge variant="success">Reviewed</Badge>
          <span>
            {alert.reviewNote} - {alert.reviewedBy}, {formatDate(alert.reviewedAt)}
          </span>
          <Button size="sm" variant="ghost" disabled={reopen.isPending} onClick={() => reopen.mutate()}>
            Reopen
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="destructive" onClick={() => onChallenge(alertHeadline(alert))}>
            <ShieldAlert className="h-4 w-4" /> Challenge {learner.firstName}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setReviewing(true)}>
            Mark as reviewed
          </Button>
        </div>
      )}
      {reviewing && <ReviewAlertDialog alert={alert} onClose={() => setReviewing(false)} onDone={onChanged} />}
    </div>
  );
}

/** "Original documents seen" - an official confirms the birth certificate (or KNEC record) matches the learner. */
export function DocumentsSeenButton({
  learner,
  onChanged,
  className,
}: {
  learner: { id: string; documentsVerifiedAt?: string | null; documentsVerifiedBy?: string | null };
  onChanged: () => void;
  className?: string;
}) {
  const verify = useMutation({
    mutationFn: (verified: boolean) => apiPost(`/api/learners/${learner.id}/verify-documents`, { verified }),
    onSuccess: onChanged,
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't save"),
  });
  if (learner.documentsVerifiedAt) {
    return (
      <button
        type="button"
        className={`inline-flex items-center gap-1 text-xs font-medium text-[#12805C] ${className ?? ""}`}
        title="Click to undo"
        disabled={verify.isPending}
        onClick={() => verify.mutate(false)}
      >
        <BadgeCheck className="h-4 w-4" /> Originals seen by {learner.documentsVerifiedBy}, {formatDate(learner.documentsVerifiedAt)}
      </button>
    );
  }
  return (
    <Button size="sm" variant="outline" className={className} disabled={verify.isPending} onClick={() => verify.mutate(true)}>
      <BadgeCheck className="h-4 w-4" /> Originals seen - they match
    </Button>
  );
}

/** A link to the learner's uploaded birth certificate or KNEC record, if there is one. */
export function DocumentLink({ learner }: { learner: { id: string; idDocumentKind?: string | null; idDocumentUpdatedAt?: string | null } }) {
  if (!learner.idDocumentUpdatedAt) return null;
  return (
    <a
      className="inline-flex items-center gap-1 text-xs text-primary underline"
      href={learnerDocumentUrl(learner.id, learner.idDocumentUpdatedAt)}
      target="_blank"
      rel="noreferrer"
    >
      <FileText className="h-3.5 w-3.5" /> {idDocumentLabel(learner.idDocumentKind)}
    </a>
  );
}
