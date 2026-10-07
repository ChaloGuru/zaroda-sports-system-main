// Checks a learner's photo before it is used for identity checks: one face,
// big enough, whole, looking at the camera, not too dark, bright or blurry.
// Runs entirely in the browser with MediaPipe's face detector (the runtime
// is copied to /mediapipe at build time, the model is /models/...), so
// children's photos are never sent to an outside service.

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedFace {
  box: FaceBox;
  score: number;
  /** MediaPipe's six keypoints, 0-1 of the image: right eye, left eye, nose tip, mouth, right ear, left ear. */
  keypoints: { x: number; y: number }[];
}

export interface FaceMeasurements {
  width: number;
  height: number;
  faces: DetectedFace[];
  /**
   * Luminance (0-255) of the face's highlights (95th percentile) and its
   * median. Exposure is judged on these, not the average: a darker-skinned
   * learner photographed in good light has a low average but bright
   * highlights, while an underexposed photo has none.
   */
  highlights: number;
  median: number;
  /** Variance of the Laplacian over the face - low means blurry. */
  sharpness: number;
}

export type PhotoCheck =
  | { ok: true; crop: { x: number; y: number; size: number } }
  | { ok: false; problems: string[] }
  /** The detector couldn't run (e.g. an old browser) - the photo is accepted and should be checked by eye. */
  | { ok: "unchecked" };

const MIN_SCORE = 0.6;
/** The face's height as a share of the photo's shorter side. */
const MIN_FACE_SHARE = 0.18;
/** Below this many pixels tall the face is too low-resolution to recognise. */
const MIN_FACE_PIXELS = 80;
/** Even the brightest parts of the face are dark - underexposed (good light gives 100+ on any skin tone). */
const TOO_DARK = 70;
/** Most of the face is near white - washed out. */
const TOO_BRIGHT = 230;
const TOO_BLURRY = 15;

/** Decides whether a photo shows the learner's face clearly enough, and where to crop it. */
export function assessFace(m: FaceMeasurements): PhotoCheck {
  const faces = m.faces.filter((f) => f.score >= MIN_SCORE);
  if (faces.length === 0) {
    return { ok: false, problems: ["No face found. Take a clear, close-up photo of the learner facing the camera."] };
  }
  if (faces.length > 1) return { ok: false, problems: ["More than one face. The photo must show only the learner."] };

  const face = faces[0]!;
  const { box } = face;
  const problems: string[] = [];
  const shorter = Math.min(m.width, m.height);

  const margin = 0.02 * shorter;
  if (box.x < -margin || box.y < -margin || box.x + box.width > m.width + margin || box.y + box.height > m.height + margin) {
    problems.push("The face is cut off at the edge. Keep the whole head in the photo.");
  }
  if (box.height < MIN_FACE_SHARE * shorter || box.height < MIN_FACE_PIXELS) {
    problems.push("The face is too small. Move closer so the face fills more of the photo.");
  }

  // Looking at the camera: the nose sits between the eyes, and the eyes are
  // a fair share of the face's width apart.
  const [rightEye, leftEye, nose] = face.keypoints;
  if (rightEye && leftEye && nose) {
    const eyeLeftX = Math.min(rightEye.x, leftEye.x) * m.width;
    const eyeRightX = Math.max(rightEye.x, leftEye.x) * m.width;
    const span = eyeRightX - eyeLeftX;
    const noseAt = (nose.x * m.width - eyeLeftX) / (span || 1);
    if (span < 0.25 * box.width || noseAt < 0.15 || noseAt > 0.85) {
      problems.push("The learner is turned sideways. They should look straight at the camera.");
    }
  }

  if (m.highlights < TOO_DARK) problems.push("The photo is too dark. Take it in better light.");
  else if (m.median > TOO_BRIGHT) problems.push("The photo is too bright. Avoid direct sun or flash on the face.");
  if (m.sharpness < TOO_BLURRY) problems.push("The photo is blurry. Hold the camera still and focus on the face.");

  if (problems.length > 0) return { ok: false, problems };

  // A square around the face (head and shoulders), kept inside the photo.
  const size = Math.min(shorter, Math.max(box.width, box.height) * 2.2);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const x = Math.min(Math.max(0, cx - size / 2), m.width - size);
  const y = Math.min(Math.max(0, cy - size / 2), m.height - size);
  return { ok: true, crop: { x: Math.round(x), y: Math.round(y), size: Math.round(size) } };
}

/** Highlight and median luminance, and Laplacian variance, of a region - on a small greyscale copy. */
function measureRegion(source: CanvasImageSource, box: FaceBox): { highlights: number; median: number; sharpness: number } {
  const n = 128;
  const canvas = document.createElement("canvas");
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { highlights: 200, median: 128, sharpness: 100 };
  ctx.drawImage(source, Math.max(0, box.x), Math.max(0, box.y), Math.max(1, box.width), Math.max(1, box.height), 0, 0, n, n);
  const { data } = ctx.getImageData(0, 0, n, n);
  const grey = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    grey[i] = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
  }
  const sorted = Float32Array.from(grey).sort();
  let lapSum = 0;
  let lapSq = 0;
  let count = 0;
  for (let y = 1; y < n - 1; y++) {
    for (let x = 1; x < n - 1; x++) {
      const i = y * n + x;
      const lap = grey[i - n]! + grey[i + n]! + grey[i - 1]! + grey[i + 1]! - 4 * grey[i]!;
      lapSum += lap;
      lapSq += lap * lap;
      count++;
    }
  }
  const mean = lapSum / count;
  return {
    highlights: sorted[Math.floor(0.95 * (sorted.length - 1))]!,
    median: sorted[Math.floor(0.5 * (sorted.length - 1))]!,
    sharpness: lapSq / count - mean * mean,
  };
}

type Detector = { detect(image: HTMLCanvasElement): { detections: { boundingBox?: { originX: number; originY: number; width: number; height: number }; categories: { score: number }[]; keypoints: { x: number; y: number }[] }[] } };
let detector: Promise<Detector> | null = null;

function loadDetector(): Promise<Detector> {
  detector ??= (async () => {
    const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks("/mediapipe");
    return FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: "/models/blaze_face_short_range.tflite", delegate: "CPU" },
      runningMode: "IMAGE",
      minDetectionConfidence: 0.5,
    }) as unknown as Detector;
  })().catch((error) => {
    detector = null; // try again next time
    throw error;
  });
  return detector;
}

/** Checks a chosen photo file; crop coordinates are in the original image's pixels. */
export async function checkLearnerPhoto(file: Blob): Promise<PhotoCheck> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, problems: ["This file couldn't be read as a photo. Choose a JPEG, PNG or WebP photo."] };
  }
  try {
    const found = await loadDetector().catch((error) => {
      console.warn("[photo-check] face detector unavailable:", error);
      return null;
    });
    if (!found) return { ok: "unchecked" };

    // Detect on a copy no bigger than 1024px, then scale back.
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = found.detect(canvas);

    const faces: DetectedFace[] = result.detections
      .filter((d) => d.boundingBox)
      .map((d) => ({
        box: { x: d.boundingBox!.originX, y: d.boundingBox!.originY, width: d.boundingBox!.width, height: d.boundingBox!.height },
        score: d.categories[0]?.score ?? 0,
        keypoints: d.keypoints ?? [],
      }));
    const best = [...faces].sort((a, b) => b.score - a.score)[0];
    const measured = best ? measureRegion(canvas, best.box) : { highlights: 200, median: 128, sharpness: 100 };
    const verdict = assessFace({ width: canvas.width, height: canvas.height, faces, ...measured });
    if (verdict.ok === true) {
      const { x, y, size } = verdict.crop;
      return { ok: true, crop: { x: Math.round(x / scale), y: Math.round(y / scale), size: Math.round(size / scale) } };
    }
    return verdict;
  } finally {
    bitmap.close();
  }
}
