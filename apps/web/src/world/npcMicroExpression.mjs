/**
 * Low-amplitude, deterministic idle micro-expressions for cloned NPC faces.
 *
 * Residents already have independent facial clocks. Use those clocks for an
 * occasional curious eyebrow lift or asymmetric half-smile, with a full rest
 * cycle between them. No timers, random numbers, additional GLBs, or extra
 * per-frame allocations are required.
 *
 * The existing facial spring handles smoothing between targets; this envelope
 * also reaches zero at both ends so a newly visible resident never snaps.
 */
const PERIOD = 7.2;
const RISE = 0.25;
const FALL = 0.42;

function smoothstep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

/**
 * @param {string} name An authored mouthSmile, cheekSquint or browInnerUp morph.
 * @param {number} elapsed Resident-specific accumulated face time in seconds.
 * @param {{talking?:boolean,nearby?:boolean,moving?:boolean,flinch?:number,emotion?:string}} context
 * @returns {number} Additional influence, always between 0 and 0.09.
 */
export function npcIdleMicroExpression(name, elapsed, {
  talking = false, nearby = false, moving = false, flinch = 0, emotion = 'neutral',
} = {}) {
  if (typeof name !== 'string' || !Number.isFinite(elapsed) || elapsed < 0 ||
      !Number.isFinite(flinch) || flinch > 0.05 ||
      talking || nearby || moving || emotion !== 'neutral') return 0;

  const cycle = Math.floor(elapsed / PERIOD);
  const variant = cycle % 3; // curiosity, soft half-smile, then a quiet rest cycle
  if (variant === 2) return 0;
  const phase = elapsed - cycle * PERIOD;
  const start = variant === 0 ? 0.85 : 1.1;
  const end = variant === 0 ? 2.3 : 2.7;
  if (phase <= start || phase >= end) return 0;
  const envelope = smoothstep((phase - start) / RISE) * smoothstep((end - phase) / FALL);

  if (variant === 0) {
    if (name === 'browInnerUp') return 0.09 * envelope;
    if (name === 'cheekSquintLeft') return 0.025 * envelope;
    if (name === 'cheekSquintRight') return 0.020 * envelope;
  } else {
    if (name === 'mouthSmileLeft') return 0.065 * envelope;
    if (name === 'mouthSmileRight') return 0.046 * envelope;
    if (name === 'cheekSquintLeft') return 0.040 * envelope;
    if (name === 'cheekSquintRight') return 0.032 * envelope;
    if (name === 'browInnerUp') return 0.012 * envelope;
  }
  return 0;
}
