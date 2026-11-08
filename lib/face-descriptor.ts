/**
 * Browser only: the 128 numbers face-api.js uses to describe a face, sent
 * with a learner's photo so the server can match faces across records
 * (lib/identity-checks.ts). The models (about 7 MB, cached after the first
 * use) are served from this site - see scripts/copy-mediapipe.mjs.
 */
type FaceApi = typeof import("@vladmandic/face-api");

const MODELS = "/face-api";
let loading: Promise<FaceApi> | null = null;

function loadFaceApi(): Promise<FaceApi> {
  loading ??= (async () => {
    // The browser build by path: the package's default entry is for Node.
    const faceapi = (await import("@vladmandic/face-api/dist/face-api.esm.js")) as unknown as FaceApi;
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODELS),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODELS),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODELS),
    ]);
    return faceapi;
  })().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

export type FaceDescriptorResult =
  | { ok: true; descriptor: number[] }
  /** The models ran but found no single clear face - the photo should be retaken. */
  | { ok: false; reason: "no-face" }
  /** The models couldn't load or run on this device - nothing is wrong with the photo. */
  | { ok: false; reason: "unavailable" };

/** A square of the photo (the face crop the photo check found, or all of it), at most `maxSide` pixels. */
async function drawRegion(image: Blob, maxSide: number, crop?: { x: number; y: number; size: number }): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(image);
  const sx = crop ? Math.max(0, crop.x) : 0;
  const sy = crop ? Math.max(0, crop.y) : 0;
  const sw = crop ? Math.min(crop.size, bitmap.width - sx) : bitmap.width;
  const sh = crop ? Math.min(crop.size, bitmap.height - sy) : bitmap.height;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext("2d")?.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

// The tiny detector's score for one face swings with its input size (a clear
// face can score 0.98 at 320 and 0.69 at 416), so several sizes are tried.
const INPUT_SIZES = [320, 416, 224, 512];
const MIN_SCORE = 0.3;

/**
 * Describes the learner's face. Tries the face-centred crop from the photo
 * check first - the face fills it, as the detector likes - then the whole photo.
 */
export async function faceDescriptorOf(image: Blob, crop?: { x: number; y: number; size: number }): Promise<FaceDescriptorResult> {
  let faceapi: FaceApi;
  try {
    faceapi = await loadFaceApi();
  } catch (error) {
    console.warn("Face matching unavailable on this device", error);
    return { ok: false, reason: "unavailable" };
  }
  try {
    const regions = crop ? [await drawRegion(image, 480, crop), await drawRegion(image, 800)] : [await drawRegion(image, 800)];
    for (const canvas of regions) {
      for (const inputSize of INPUT_SIZES) {
        const result = await faceapi
          .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: MIN_SCORE }))
          .withFaceLandmarks(true)
          .withFaceDescriptor();
        if (result) return { ok: true, descriptor: Array.from(result.descriptor) };
      }
    }
    return { ok: false, reason: "no-face" };
  } catch (error) {
    console.warn("Face matching failed on this device", error);
    return { ok: false, reason: "unavailable" };
  }
}
