// Copies MediaPipe's WebAssembly runtime and face-api.js's models into
// public/ so the learner-photo face check (lib/photo-check.ts) and face
// matching (lib/face-descriptor.ts) load them from this site - nothing from
// a CDN, and the CSP stays 'self'. Runs before every build; the copies are
// git-ignored.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function copy(fromDir, toDir, files) {
  const from = join(root, "node_modules", ...fromDir);
  const to = join(root, "public", toDir);
  mkdirSync(to, { recursive: true });
  for (const file of files) copyFileSync(join(from, file), join(to, file));
}

copy(["@mediapipe", "tasks-vision", "wasm"], "mediapipe", [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
]);
copy(["@vladmandic", "face-api", "model"], "face-api", [
  "tiny_face_detector_model-weights_manifest.json",
  "tiny_face_detector_model.bin",
  "face_landmark_68_tiny_model-weights_manifest.json",
  "face_landmark_68_tiny_model.bin",
  "face_recognition_model-weights_manifest.json",
  "face_recognition_model.bin",
]);
console.log("Copied MediaPipe runtime and face-api models to public/");
