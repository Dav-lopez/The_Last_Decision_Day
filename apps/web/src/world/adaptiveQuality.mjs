/**
 * Dynamic resolution: watches frame times and trades sharpness for smoothness.
 * When the frame rate stays under the target, render at a lower resolution
 * (and then drop ambient occlusion); when there's headroom, climb back.
 * `scale` is Babylon's hardware scaling level (1 = native; 2 = half resolution).
 */
export const QUALITY = Object.freeze({
  targetFps: 50, headroomFps: 58, window: 1.5, step: 0.15, maxScale: 2, settle: 1,
});

export function createQuality(baseScale = 1) {
  const base = Number.isFinite(baseScale) && baseScale > 0 ? baseScale : 1;
  return { base, scale: base, ambientOcclusion: true, elapsed: 0, frames: 0, cooldown: QUALITY.settle, fps: null };
}

/** Feed one frame's duration (seconds). Returns the new state; `changed` says whether to apply it. */
export function stepQuality(state, seconds) {
  if (!(seconds > 0) || seconds > 1) return { state, changed: false }; // tab switches, debugger pauses
  let next = { ...state, elapsed: state.elapsed + seconds, frames: state.frames + 1, cooldown: Math.max(0, state.cooldown - seconds) };
  if (next.elapsed < QUALITY.window) return { state: next, changed: false };
  const fps = next.frames / next.elapsed;
  next = { ...next, elapsed: 0, frames: 0, fps };
  if (next.cooldown > 0) return { state: next, changed: false };
  if (fps < QUALITY.targetFps) {
    if (next.scale < QUALITY.maxScale - 1e-9) {
      return { state: { ...next, scale: Math.min(QUALITY.maxScale, next.scale + QUALITY.step), cooldown: QUALITY.settle }, changed: true };
    }
    if (next.ambientOcclusion) return { state: { ...next, ambientOcclusion: false, cooldown: QUALITY.settle }, changed: true };
  } else if (fps > QUALITY.headroomFps) {
    if (!next.ambientOcclusion && next.scale <= next.base + 1e-9) return { state: { ...next, ambientOcclusion: true, cooldown: QUALITY.settle * 3 }, changed: true };
    if (next.scale > next.base + 1e-9) {
      return { state: { ...next, scale: Math.max(next.base, next.scale - QUALITY.step / 2), cooldown: QUALITY.settle * 2 }, changed: true };
    }
  }
  return { state: next, changed: false };
}
