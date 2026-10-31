import { smoothHumanHeading } from '../humanMotion.mjs';

/**
 * Validate a remote player's scene pose before passing it to Babylon.
 * Busy characters remain visible standing idle; drivers retain their
 * nameplate but not an on-foot body. Never propagate NaN into transforms.
 */
export function visibleRemotePose(pose, location) {
  if (!pose || pose.location !== location ||
      (pose.mode !== 'walking' && pose.mode !== 'busy' && pose.mode !== 'driving') ||
      ![pose.x, pose.z, pose.rotation].every(Number.isFinite)) return null;
  return {
    x: pose.x, z: pose.z, rotation: pose.rotation,
    mode: pose.mode, showBody: pose.mode !== 'driving',
    speed: pose.mode === 'walking' && Number.isFinite(pose.speed)
      ? Math.max(0, Math.min(8, pose.speed)) : 0,
  };
}

/**
 * Peer poses arrive roughly every 200ms. Ease nearby changes, but snap
 * initial placement, scene re-entry and teleports. Clamp invalid frames.
 */
export function stepRemotePose(current, target, seconds, placed) {
  const dt = Number.isFinite(seconds) ? Math.max(0, Math.min(0.1, seconds)) : 0;
  const snap = !placed || Math.hypot(current.x - target.x, current.z - target.z) > 12;
  const blend = snap ? 1 : 1 - Math.exp(-12 * dt);
  return {
    x: current.x + (target.x - current.x) * blend,
    z: current.z + (target.z - current.z) * blend,
    rotation: snap ? target.rotation : smoothHumanHeading(current.rotation, target.rotation, dt),
  };
}
