// Copies MediaPipe's WebAssembly runtime into public/ so the learner-photo
// face check (lib/photo-check.ts) loads it from this site - nothing from a
// CDN, and the CSP stays 'self'. Runs before every build; the copies are
// git-ignored.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const to = join(root, "public", "mediapipe");
mkdirSync(to, { recursive: true });
for (const file of ["vision_wasm_internal.js", "vision_wasm_internal.wasm", "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm"]) {
  copyFileSync(join(from, file), join(to, file));
}
console.log("Copied MediaPipe runtime to public/mediapipe");
