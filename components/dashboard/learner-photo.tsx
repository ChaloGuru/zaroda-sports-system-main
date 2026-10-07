"use client";

import * as React from "react";
import { Camera, FileText, ImageUp, SwitchCamera, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { checkLearnerPhoto } from "@/lib/photo-check";
import { faceDescriptorOf } from "@/lib/face-descriptor";
import { ID_DOCUMENT_KINDS, MAX_DOCUMENT_BYTES, type IdDocumentKind } from "@/lib/learner-documents";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** A learner's identity details as officials' participant lists return them. */
export interface LearnerIdentity {
  id: string;
  birthCertNumber: string | null;
  knecAssessmentNumber?: string | null;
  kemisUpi?: string | null;
  dateOfBirth: string | null;
  photoUpdatedAt: string | null;
  idDocumentKind?: string | null;
  idDocumentUpdatedAt?: string | null;
  documentsVerifiedAt?: string | null;
  documentsVerifiedBy?: string | null;
  participants: { gameId: string; game: { name: string } }[];
  /** Open or upheld challenges only. */
  challenges?: { id: string; reason: string; status: "OPEN" | "UPHELD" | "CLEARED"; raisedBy: string; createdAt: string }[];
  _count?: { alertsAsA: number; alertsAsB: number };
}

type LearnerIdNumbers = { birthCertNumber: string | null; knecAssessmentNumber?: string | null; kemisUpi?: string | null };

/** "Birth cert. 123 · KNEC 456 · KEMIS UPI ABC" - only the numbers given, for identity checks. */
export function idNumbersLine(l: LearnerIdNumbers): string {
  return [
    l.birthCertNumber ? `Birth cert. ${l.birthCertNumber}` : "No birth cert. no.",
    l.knecAssessmentNumber ? `KNEC ${l.knecAssessmentNumber}` : null,
    l.kemisUpi ? `KEMIS UPI ${l.kemisUpi}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The ID numbers as one lowercase string, for search boxes. */
export function idSearchText(l: LearnerIdNumbers): string {
  return `${l.birthCertNumber ?? ""} ${l.knecAssessmentNumber ?? ""} ${l.kemisUpi ?? ""}`.toLowerCase();
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

/** A learner's photo as a data URL, for putting in a PDF - null when there's none or it can't be fetched. */
export async function learnerPhotoDataUrl(learnerId: string, photoUpdatedAt: string | null): Promise<string | null> {
  if (!photoUpdatedAt) return null;
  try {
    const res = await fetch(`/api/learners/${learnerId}/photo?v=${encodeURIComponent(photoUpdatedAt)}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Age in whole years from an ISO date of birth. */
export function ageFrom(dateOfBirth: string, on = new Date()): number {
  const dob = new Date(dateOfBirth);
  const age = on.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < dob.getUTCMonth() || (on.getUTCMonth() === dob.getUTCMonth() && on.getUTCDate() < dob.getUTCDate());
  return beforeBirthday ? age - 1 : age;
}

/** The largest photo file accepted for resizing - phone photos are a few MB. */
export const MAX_SOURCE_PHOTO_BYTES = 15 * 1024 * 1024;
/** What the server accepts after resizing (lib/learners.ts MAX_PHOTO_BYTES). */
const MAX_UPLOAD_BYTES = 300 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Why a chosen file can't be used as a learner photo, or null when it can. */
export function photoFileProblem(file: File): string | null {
  if (!PHOTO_TYPES.includes(file.type)) return "Choose a JPEG, PNG or WebP photo.";
  if (file.size > MAX_SOURCE_PHOTO_BYTES) {
    return `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB - choose one under ${MAX_SOURCE_PHOTO_BYTES / 1024 / 1024} MB.`;
  }
  return null;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't read that photo"))), "image/jpeg", quality),
  );
}

/**
 * Crops a photo to a square - around the face when the face check found one,
 * otherwise the centre - and shrinks it to a small JPEG (at most 320px)
 * before upload, so it fits the call-room frame and the nominal roll
 * without stretching. Lowers the quality if it's still over the upload limit.
 */
export async function resizePhoto(file: File, maxSide = 320, crop?: { x: number; y: number; size: number }): Promise<Blob> {
  const problem = photoFileProblem(file);
  if (problem) throw new Error(problem);
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Couldn't read that photo - try another one.");
  });
  const side = crop ? Math.min(crop.size, bitmap.width, bitmap.height) : Math.min(bitmap.width, bitmap.height);
  const sx = crop ? Math.min(Math.max(0, crop.x), bitmap.width - side) : (bitmap.width - side) / 2;
  const sy = crop ? Math.min(Math.max(0, crop.y), bitmap.height - side) : (bitmap.height - side) / 2;
  const out = Math.min(maxSide, side);
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  canvas.getContext("2d")?.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);
  bitmap.close();
  for (const quality of [0.82, 0.7, 0.55, 0.4]) {
    const blob = await canvasToJpeg(canvas, quality);
    if (blob.size <= MAX_UPLOAD_BYTES) return blob;
  }
  throw new Error("That photo is too large even after shrinking - try another one.");
}

/**
 * Checks, crops around the face, resizes and uploads a learner's photo,
 * with the face's descriptor for matching it against other records.
 */
export async function uploadLearnerPhoto(learnerId: string, file: File): Promise<void> {
  const check = await checkLearnerPhoto(file);
  if (check.ok === false) throw new Error(check.problems.join(" "));
  const form = new FormData();
  form.append("photo", await resizePhoto(file, 320, check.ok === true ? check.crop : undefined), "photo.jpg");
  const descriptor = await faceDescriptorOf(file);
  if (descriptor) form.append("faceDescriptor", JSON.stringify(descriptor));
  const res = await fetch(`/api/learners/${learnerId}/photo`, { method: "PUT", body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Photo upload failed");
  }
}

/** Shrinks a photo of a document to at most 1600px - still readable - and under the upload limit. */
async function resizeDocument(file: File): Promise<Blob> {
  const problem = photoFileProblem(file);
  if (problem) throw new Error(problem.replace("photo", "document photo"));
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Couldn't read that document photo - try another one.");
  });
  for (const maxSide of [1600, 1200]) {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.65, 0.5]) {
      const blob = await canvasToJpeg(canvas, quality);
      if (blob.size <= MAX_DOCUMENT_BYTES) {
        bitmap.close();
        return blob;
      }
    }
  }
  bitmap.close();
  throw new Error("That document photo is too large even after shrinking - try another one.");
}

/** Uploads a photo of the learner's birth certificate or KNEC record. */
export async function uploadLearnerDocument(learnerId: string, file: File, kind: IdDocumentKind): Promise<void> {
  const form = new FormData();
  form.append("document", await resizeDocument(file), "document.jpg");
  form.append("kind", kind);
  const res = await fetch(`/api/learners/${learnerId}/document`, { method: "PUT", body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Document upload failed");
  }
}

/** The learner's uploaded document, opened full size in a new tab. */
export function learnerDocumentUrl(learnerId: string, updatedAt: string): string {
  return `/api/learners/${learnerId}/document?v=${encodeURIComponent(updatedAt)}`;
}

export interface DocumentChoice {
  file: File | null;
  kind: IdDocumentKind;
}

/**
 * A photo of the learner's birth certificate or KNEC registration record -
 * photographed with the device or chosen from a file. Optional; officials
 * compare it with the learner and the original.
 */
export function DocumentPicker({
  value,
  onChange,
  current,
}: {
  value: DocumentChoice;
  onChange: (value: DocumentChoice) => void;
  current?: { learnerId: string; idDocumentUpdatedAt: string | null | undefined };
}) {
  const cameraInput = React.useRef<HTMLInputElement>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [problem, setProblem] = React.useState<string | null>(null);

  function fromInput(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0] ?? null;
    e.target.value = "";
    const reason = chosen && photoFileProblem(chosen);
    setProblem(reason || null);
    onChange({ ...value, file: reason ? null : chosen });
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={value.kind} onValueChange={(kind) => onChange({ ...value, kind: kind as IdDocumentKind })}>
          <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ID_DOCUMENT_KINDS.map((k) => (
              <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" size="sm" variant="secondary" onClick={() => cameraInput.current?.click()}>
          <Camera className="h-4 w-4" /> Photograph it
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
          <ImageUp className="h-4 w-4" /> Choose file
        </Button>
      </div>
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={fromInput} />
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={fromInput} />
      {problem ? (
        <p className="text-xs font-medium text-destructive">{problem}</p>
      ) : value.file ? (
        <p className="flex items-center gap-1 text-xs text-foreground">
          <FileText className="h-3.5 w-3.5" /> {value.file.name} - uploaded when you save
        </p>
      ) : current?.idDocumentUpdatedAt ? (
        <p className="text-xs text-muted">
          <a className="text-primary underline" href={learnerDocumentUrl(current.learnerId, current.idDocumentUpdatedAt)} target="_blank" rel="noreferrer">
            View the uploaded document
          </a>{" "}
          - choose another to replace it.
        </p>
      ) : (
        <p className="text-xs text-muted">Optional - lay the document flat in good light so every line can be read.</p>
      )}
    </div>
  );
}

/**
 * Takes a photo with the computer's camera: a live preview, Capture, and
 * Switch camera. (Phones and tablets use their own camera app instead - see
 * PhotoPicker.)
 */
function CameraDialog({ onCapture, onClose }: { onCapture: (file: File) => void; onClose: () => void }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = React.useState<"user" | "environment">("user");
  const [error, setError] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setReady(false);
    setError(null);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play().then(() => setReady(true));
        }
      })
      .catch((e: unknown) => {
        const name = e instanceof DOMException ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "Camera access was blocked. Allow the camera for this site in your browser, or choose a photo file instead."
            : name === "NotFoundError"
              ? "No camera was found on this device. Choose a photo file instead."
              : "The camera couldn't be started. Choose a photo file instead.",
        );
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // The preview is mirrored for the front camera; the photo isn't.
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Take the learner&apos;s photo</DialogTitle>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <>
            <div className="overflow-hidden rounded-md bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                className={cn("aspect-[4/3] w-full object-cover", facing === "user" && "-scale-x-100")}
              />
            </div>
            <p className="text-xs text-muted">Face the camera in good light, with only the learner in the picture.</p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!ready} onClick={capture}>
                <Camera className="h-4 w-4" /> Capture
              </Button>
              <Button variant="outline" onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}>
                <SwitchCamera className="h-4 w-4" /> Switch camera
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Photo for a learner: taken with the device's camera or chosen from a file,
 * then checked for a clear face before it's accepted.
 */
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
  const [problem, setProblem] = React.useState<string | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [unchecked, setUnchecked] = React.useState(false);
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const cameraInput = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  /** Every photo - taken or chosen - goes through the same checks. */
  async function accept(chosen: File | null) {
    setUnchecked(false);
    const reason = chosen && photoFileProblem(chosen);
    if (!chosen || reason) {
      setProblem(reason || null);
      onChange(null);
      return;
    }
    // The face check runs here, so a poor photo is turned away at once.
    setChecking(true);
    setProblem(null);
    const check = await checkLearnerPhoto(chosen);
    setChecking(false);
    if (check.ok === false) {
      setProblem(check.problems.join(" "));
      onChange(null);
      return;
    }
    setUnchecked(check.ok === "unchecked");
    onChange(chosen);
  }

  function takePhoto() {
    // Phones and tablets open their own camera app (rear camera - the
    // registrar photographs the learner); computers get the camera window.
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (touch || !navigator.mediaDevices?.getUserMedia) cameraInput.current?.click();
    else setCameraOpen(true);
  }

  function fromInput(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0] ?? null;
    e.target.value = "";
    void accept(chosen);
  }

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
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={checking} onClick={takePhoto}>
            <Camera className="h-4 w-4" /> Take photo
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={checking} onClick={() => fileInput.current?.click()}>
            <ImageUp className="h-4 w-4" /> Choose file
          </Button>
        </div>
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={fromInput} />
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={fromInput} />
        {checking ? (
          <p className="mt-1 text-xs text-muted">Checking the photo...</p>
        ) : problem ? (
          <p className="mt-1 text-xs font-medium text-destructive">{problem}</p>
        ) : unchecked ? (
          <p className="mt-1 text-xs text-[#B45309]">
            This photo couldn&apos;t be checked automatically on this device - make sure the face is clear and facing the camera.
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted">A clear face photo - checked against the learner in the call room.</p>
        )}
      </div>
      {cameraOpen && (
        <CameraDialog
          onClose={() => setCameraOpen(false)}
          onCapture={(captured) => {
            setCameraOpen(false);
            void accept(captured);
          }}
        />
      )}
    </div>
  );
}
