/** Own preset transitions only; user orbit and zoom remain untouched between switches. */
import { cameraFollowAlpha } from './cameraFollow.mjs';
export const CAMERA_PRESETS = Object.freeze({
  follow: Object.freeze({ radius: 7.5, beta: 1.15, minRadius: 2.8, maxRadius: 18, minBeta: 0.4, maxBeta: 1.48 }),
  overhead: Object.freeze({ radius: 22, beta: 0.35, minRadius: 9, maxRadius: 30, minBeta: 0.15, maxBeta: 0.8 }),
});

export function createCameraControls(camera) {
  let mode = 'follow';
  let transition = null;
  function limits() {
    const preset = CAMERA_PRESETS[mode];
    camera.lowerRadiusLimit = preset.minRadius;
    camera.upperRadiusLimit = preset.maxRadius;
    camera.lowerBetaLimit = preset.minBeta;
    camera.upperBetaLimit = preset.maxBeta;
  }
  function cancel() {
    transition = null;
  }
  function setMode(next, reset = false) {
    if (!(next in CAMERA_PRESETS) || (next === mode && !reset)) return;
    mode = next;
    limits();
    camera.inertialRadiusOffset = 0;
    camera.inertialBetaOffset = 0;
    // Start within the new bounds so Babylon's clamping cannot fight the transition.
    camera.radius = Math.max(camera.lowerRadiusLimit, Math.min(camera.upperRadiusLimit, camera.radius));
    camera.beta = Math.max(camera.lowerBetaLimit, Math.min(camera.upperBetaLimit, camera.beta));
    transition = { radius: camera.radius, beta: camera.beta, elapsed: 0 };
  }
  limits();
  return {
    setMode,
    cancel,
    follow(position, seconds) {
      const target = camera.getTarget().clone();
      const alpha = cameraFollowAlpha(seconds);
      target.x += (position.x - target.x) * alpha;
      target.y += (1.25 - target.y) * alpha;
      target.z += (position.z - target.z) * alpha;
      // setTarget's default rebuildAnglesAndRadius also undoes zoom and alters
      // orbit while walking. Preserve those values as the target translates.
      camera.setTarget(target, false, false, true);
    },
    update(seconds) {
      if (!transition || !Number.isFinite(seconds) || seconds <= 0) return;
      transition.elapsed += seconds;
      const t = Math.min(1, transition.elapsed / 0.4);
      const ease = t * t * (3 - 2 * t);
      const preset = CAMERA_PRESETS[mode];
      camera.radius = transition.radius + (preset.radius - transition.radius) * ease;
      camera.beta = transition.beta + (preset.beta - transition.beta) * ease;
      if (t === 1) transition = null;
    },
    zoom(direction) {
      cancel();
      camera.inertialRadiusOffset = 0;
      camera.radius = Math.max(camera.lowerRadiusLimit,
        Math.min(camera.upperRadiusLimit, camera.radius * (direction === 'in' ? 0.8 : 1.25)));
    },
    reset() {
      camera.alpha = Math.PI / 2;
      camera.inertialAlphaOffset = 0;
      setMode(mode, true);
    },
  };
}
