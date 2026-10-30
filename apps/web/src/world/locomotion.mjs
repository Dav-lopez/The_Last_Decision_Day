import { stepPosition } from './movement.mjs';
import { HUMAN_WALK_SPEED, HUMAN_RUN_SPEED, classifyHumanMotion } from './humanMotion.mjs';

/** The same path powers keyboard/touch movement and selects the displayed clip. */
export function stepLocomotion(position, keys, seconds, sprintEnabled, cameraForward) {
  const elapsed = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.05)) : 0;
  const running = sprintEnabled || keys.has('Shift');
  const next = stepPosition(position, keys, elapsed, running ? HUMAN_RUN_SPEED : HUMAN_WALK_SPEED, cameraForward);
  const speed = elapsed > 0 ? Math.hypot(next.x - position.x, next.z - position.z) / elapsed : 0;
  return { position: next, speed, moving: speed > 0, motion: classifyHumanMotion(speed) };
}
