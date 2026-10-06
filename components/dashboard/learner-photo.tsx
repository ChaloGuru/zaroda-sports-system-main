"use client";

import * as React from "react";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

/** A learner's identity details as officials' participant lists return them. */
export interface LearnerIdentity {
  id: string;
  birthCertNumber: string | null;
  dateOfBirth: string | null;
  photoUpdatedAt: string | null;
  participants: { gameId: string; game: { name: string } }[];
}

/** The learner's photo for identity checks, or an empty frame when there isn't one. */
export function LearnerPhoto({
  learnerId,
  photoUpdatedAt,
  name,
  className,
}: {
  learnerId: string | null | undefined;
  photoUpdatedAt: string | null | undefined;
  name: string;
  className?: string;
}) {
  const frame = cn("shrink-0 overflow-hidden rounded-md border border-border bg-secondary", className ?? "h-10 w-10");
  if (!learnerId || !photoUpdatedAt) {
    return (
      <div className={cn(frame, "flex items-center justify-center text-muted")} title="No photo">
        <UserRound className="h-1/2 w-1/2" />
      </div>
    );
  }
  return (
    <img
      src={`/api/learners/${learnerId}/photo?v=${encodeURIComponent(photoUpdatedAt)}`}
      alt={`Photo of ${name}`}
      className={cn(frame, "object-cover")}
    />
  );
}

/** Age in whole years from an ISO date of birth. */
export function ageFrom(dateOfBirth: string, on = new Date()): number {
  const dob = new Date(dateOfBirth);
  const age = on.getFullYear() - dob.getUTCFullYear();
  const beforeBirthday = on.getMonth() < dob.getUTCMonth() || (on.getMonth() === dob.getUTCMonth() && on.getDate() < dob.getUTCDate());
  return beforeBirthday ? age - 1 : age;
}

/**
 * Crops a photo to a centred square and shrinks it to a small JPEG (at most
 * 320px) before upload - square so it fits the call-room frame and the
 * nominal roll without stretching.
 */
export async function resizePhoto(file: File, maxSide = 320): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const out = Math.min(maxSide, side);
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  canvas.getContext("2d")?.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't read that photo"))), "image/jpeg", 0.82),
  );
}

/** Resizes and uploads a learner's photo. */
export async function uploadLearnerPhoto(learnerId: string, file: File): Promise<void> {
  const form = new FormData();
  form.append("photo", await resizePhoto(file), "photo.jpg");
  const res = await fetch(`/api/learners/${learnerId}/photo`, { method: "PUT", body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Photo upload failed");
  }
}

/** File picker for a learner photo, with a preview of the chosen file. */
export function PhotoPicker({
  file,
  onChange,
  current,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  current?: { learnerId: string; photoUpdatedAt: string | null; name: string };
}) {
  const [preview, setPreview] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="flex items-center gap-3">
      {preview ? (
        <img src={preview} alt="Chosen photo" className="h-16 w-16 rounded-md border border-border object-cover" />
      ) : (
        <LearnerPhoto
          learnerId={current?.learnerId}
          photoUpdatedAt={current?.photoUpdatedAt}
          name={current?.name ?? "learner"}
          className="h-16 w-16"
        />
      )}
      <div className="text-sm">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-foreground"
        />
        <p className="mt-1 text-xs text-muted">A clear face photo - checked against the learner in the call room.</p>
      </div>
    </div>
  );
}
