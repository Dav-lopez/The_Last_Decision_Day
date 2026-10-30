/**
 * Frame-rate-independent, critically damped motion for facial morph targets.
 * Keeps morph velocity through interrupted expressions, so a smile does not
 * snap or restart when the player changes emotion mid-transition.
 */
const DEFAULT_FREQUENCY = 12;

export function facialMorphFrequency(name) {
  if (/^(jaw|mouthOpen|mouthPress)/.test(name)) return 19;
  if (/^(mouthSmile|mouthFrown)/.test(name)) return 12;
  if (/^cheek/.test(name)) return 9;
  if (/^brow/.test(name)) return 13;
  if (/^eye/.test(name)) return 16;
  return DEFAULT_FREQUENCY;
}

/**
 * Critically damped spring with no oscillation from rest. Invalid/long frames
 * are treated as paused, rather than letting a background-tab resume skip a
 * whole facial transition. Blink and droplet morphs are animated separately.
 *
 * @param {{value:number, velocity:number}} previous
 * @param {number} target
 * @param {number} seconds
 * @param {string} name
 * @returns {{value:number, velocity:number}}
 */
export function advanceFacialMorph(previous, target, seconds, name = '') {
  const value = Number.isFinite(previous?.value) ? Math.min(1, Math.max(0, previous.value)) : 0;
  const velocity = Number.isFinite(previous?.velocity) ? previous.velocity : 0;
  const goal = Number.isFinite(target) ? Math.min(1, Math.max(0, target)) : 0;
  const dt = Number.isFinite(seconds) ? Math.min(0.1, Math.max(0, seconds)) : 0;
  if (dt === 0) return { value, velocity };

  const omega = facialMorphFrequency(name);
  const delta = value - goal;
  const coefficient = velocity + omega * delta;
  const decay = Math.exp(-omega * dt);
  const next = goal + (delta + coefficient * dt) * decay;
  const nextVelocity = (velocity - omega * coefficient * dt) * decay;
  if (next <= 0) return { value: 0, velocity: 0 };
  if (next >= 1) return { value: 1, velocity: 0 };
  return { value: next, velocity: nextVelocity };
}
