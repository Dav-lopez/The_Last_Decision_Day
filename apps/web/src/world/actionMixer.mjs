/**
 * One action at a time layered over locomotion (idle/walk/run): fades in,
 * plays (looping or once), fades out, and hands the body back. Pure state;
 * the Babylon side sets the action clip's weight to `weight` and scales
 * locomotion by 1 - weight.
 */
export const ACTION_FADE = 0.18;
export const LOOPING_ACTIONS = Object.freeze(new Set(['Talk', 'Sit', 'SitTalk', 'Drive', 'JumpAir', 'Dance']));

export function startAction(name, duration, loop = LOOPING_ACTIONS.has(name)) {
  return { name, loop, duration: Number.isFinite(duration) && duration > 0 ? duration : 1, elapsed: 0, stopAt: null };
}

export function stopAction(state) {
  if (!state || state.stopAt !== null) return state;
  return { ...state, stopAt: state.elapsed };
}

/** Advance; returns { state (null once fully faded out), weight 0..1 }. */
export function stepAction(state, seconds) {
  if (!state) return { state: null, weight: 0 };
  const dt = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.1)) : 0;
  let next = { ...state, elapsed: state.elapsed + dt };
  // A one-shot starts fading out so it has finished exactly when the clip ends.
  if (!next.loop && next.stopAt === null && next.elapsed >= next.duration - ACTION_FADE) {
    next.stopAt = Math.max(0, next.duration - ACTION_FADE);
  }
  const fadeIn = Math.min(1, next.elapsed / ACTION_FADE);
  const fadeOut = next.stopAt === null ? 1 : 1 - (next.elapsed - next.stopAt) / ACTION_FADE;
  if (fadeOut <= 0) return { state: null, weight: 0 };
  return { state: next, weight: Math.max(0, Math.min(fadeIn, fadeOut)) };
}

/** A jump: vertical offset (m) for a hop of `height` lasting `duration` seconds. */
export const JUMP = Object.freeze({ height: 0.42, duration: 0.62 });
export function jumpHeight(elapsed, jump = JUMP) {
  if (!(elapsed > 0) || elapsed >= jump.duration) return 0;
  const t = elapsed / jump.duration;
  return 4 * jump.height * t * (1 - t);
}

/**
 * Body lean for a walker or a car: roll into (people) or out of (cars) a turn
 * from the yaw rate and speed, pitch from acceleration. Radians, clamped.
 */
export function bodyLean({ yawRate, speed, acceleration = 0, kind = 'person', tired = false }) {
  const clamp = (v, m) => Math.max(-m, Math.min(m, Number.isFinite(v) ? v : 0));
  if (kind === 'car') {
    return { roll: clamp(speed * yawRate * 0.018, 0.07), pitch: clamp(-acceleration * 0.012, 0.06) };
  }
  // People bank into the turn (negative roll leans toward +x for a right turn) and lean forward when running or tired.
  return { roll: clamp(-yawRate * speed * 0.035, 0.16), pitch: clamp(speed * 0.018 + (tired ? 0.09 : 0), 0.16) };
}

/** Smallest signed difference between two headings (radians). */
export function headingDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
