// Pure, deterministic animation and heading helpers used by the playable human.
export const HUMAN_CROSSFADE_SECONDS = 0.2;
export const HUMAN_MOTIONS = Object.freeze(['idle', 'walk', 'run']);

export function classifyHumanMotion(speed) {
  if (!Number.isFinite(speed) || speed <= 0.05) return 'idle';
  return speed > 4.8 ? 'run' : 'walk';
}

/** A linear 0.2s crossfade. Call with a snapshot of current weights at transition start. */
export function blendHumanWeights(from, target, elapsed, duration = HUMAN_CROSSFADE_SECONDS) {
  const fraction = Math.min(1, Math.max(0, elapsed / Math.max(duration, 0.0001)));
  return Object.fromEntries(HUMAN_MOTIONS.map(name => [
    name, (from[name] ?? 0) * (1 - fraction) + (name === target ? fraction : 0),
  ]));
}

/** Shortest angular path, including the -PI/+PI seam; frame-rate-independent easing. */
export function smoothHumanHeading(current, target, seconds, responsiveness = 12) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-responsiveness * Math.max(0, seconds)));
}
