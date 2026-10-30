/** Deterministic, frame-rate-independent eyelid closure with occasional double blinks. */
const INTERVAL_VARIATION = [0, 0.42, 0.18, 0.65, 0.27];
const DURATION = 0.30;

function intervalFor(count) {
  // A brief second blink every eighth cycle prevents robotic periodicity.
  return count > 0 && count % 8 === 0 ? 0.44 : 2.65 + INTERVAL_VARIATION[count % INTERVAL_VARIATION.length];
}

function lid(t) {
  if (t <= 0) return 0;
  if (t < 0.075) return t / 0.075;
  if (t < 0.125) return 1;
  if (t < 0.265) return 1 - (t - 0.125) / 0.14;
  return 0;
}

/**
 * Advance one render frame. Paused tabs and invalid frame deltas must not
 * skip dozens of blinks or poison morph influences with NaN.
 * @param {{elapsed:number,count:number}} state
 * @param {number} seconds
 */
export function stepBlink(state, seconds) {
  const dt = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.1)) : 0;
  let elapsed = Number.isFinite(state?.elapsed) ? Math.max(0, state.elapsed) + dt : dt;
  let count = Number.isSafeInteger(state?.count) && state.count >= 0 ? state.count : 0;
  // A bounded catch-up loop also makes state restoration safe.
  for (let i = 0; i < 16; i++) {
    const duration = intervalFor(count) + DURATION;
    if (elapsed < duration) break;
    elapsed -= duration;
    count++;
  }
  const t = elapsed - intervalFor(count);
  return { elapsed, count, left: lid(t), right: lid(t - 0.012) };
}
