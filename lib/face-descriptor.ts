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

/** The face's descriptor, or null when there's no single clear face or the models can't load (the photo is still accepted). */
export async function faceDescriptorOf(image: Blob): Promise<number[] | null> {
  try {
    const faceapi = await loadFaceApi();
    const bitmap = await createImageBitmap(image);
    const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const result = await faceapi
      .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();
    return result ? Array.from(result.descriptor) : null;
  } catch (error) {
    console.warn("Face matching unavailable on this device", error);
    return null;
  }
}
