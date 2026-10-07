import { describe, it, expect } from "vitest";
import { assessFace, type DetectedFace, type FaceMeasurements } from "@/lib/photo-check";

/** A clear, front-facing face in the middle of a 600x800 photo. */
function face(overrides: Partial<DetectedFace> = {}): DetectedFace {
  return {
    box: { x: 200, y: 250, width: 200, height: 220 },
    score: 0.95,
    // right eye, left eye, nose, mouth, right ear, left ear (0-1 of the photo)
    keypoints: [
      { x: 0.42, y: 0.38 },
      { x: 0.58, y: 0.38 },
      { x: 0.5, y: 0.45 },
      { x: 0.5, y: 0.52 },
      { x: 0.35, y: 0.4 },
      { x: 0.65, y: 0.4 },
    ],
    ...overrides,
  };
}

function photo(overrides: Partial<FaceMeasurements> = {}): FaceMeasurements {
  return { width: 600, height: 800, faces: [face()], highlights: 190, median: 110, sharpness: 120, ...overrides };
}

describe("learner photo check", () => {
  it("accepts a clear front-facing photo and crops a square around the face", () => {
    const result = assessFace(photo());
    expect(result.ok).toBe(true);
    if (result.ok !== true) return;
    // 2.2x the face, centred on it, inside the photo.
    expect(result.crop).toEqual({ x: 58, y: 118, size: 484 });
  });

  it("rejects a photo with no face", () => {
    expect(assessFace(photo({ faces: [] }))).toEqual({ ok: false, problems: [expect.stringMatching(/^No face found/)] });
  });

  it("ignores weak detections that aren't really faces", () => {
    expect(assessFace(photo({ faces: [face({ score: 0.4 })] })).ok).toBe(false);
  });

  it("rejects group photos", () => {
    expect(assessFace(photo({ faces: [face(), face({ box: { x: 20, y: 20, width: 150, height: 160 } })] }))).toEqual({
      ok: false,
      problems: [expect.stringMatching(/^More than one face/)],
    });
  });

  it("rejects a face that's too small or too low-resolution", () => {
    const small = assessFace(photo({ faces: [face({ box: { x: 280, y: 300, width: 60, height: 70 } })] }));
    expect(small).toEqual({ ok: false, problems: [expect.stringMatching(/too small/)] });
  });

  it("rejects a face cut off at the edge", () => {
    const cut = assessFace(photo({ faces: [face({ box: { x: 480, y: 250, width: 200, height: 220 } })] }));
    expect(cut.ok === false && cut.problems.some((p) => /cut off/.test(p))).toBe(true);
  });

  it("rejects a face turned sideways", () => {
    const sideways = face({
      keypoints: [
        { x: 0.6, y: 0.38 },
        { x: 0.64, y: 0.38 },
        { x: 0.7, y: 0.45 },
        { x: 0.65, y: 0.52 },
        { x: 0.5, y: 0.4 },
        { x: 0.7, y: 0.4 },
      ],
    });
    expect(assessFace(photo({ faces: [sideways] }))).toEqual({ ok: false, problems: [expect.stringMatching(/turned sideways/)] });
  });

  it("rejects underexposed, washed-out and blurry photos - and says everything that's wrong", () => {
    expect(assessFace(photo({ highlights: 50, median: 30 }))).toEqual({ ok: false, problems: [expect.stringMatching(/too dark/)] });
    expect(assessFace(photo({ highlights: 255, median: 242 }))).toEqual({ ok: false, problems: [expect.stringMatching(/too bright/)] });
    const both = assessFace(photo({ highlights: 50, median: 30, sharpness: 3 }));
    expect(both.ok === false && both.problems).toHaveLength(2);
  });

  it("doesn't reject a darker-skinned learner photographed in good light", () => {
    // Low average and median, but real highlights - measured on a real photo dimmed to 70%.
    expect(assessFace(photo({ highlights: 125, median: 54 })).ok).toBe(true);
  });
});
