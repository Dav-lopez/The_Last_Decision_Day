/** Bounded, frame-rate-independent timing for visible facial materials. */
const CHANNELS = ['tears', 'blush', 'sweat', 'wateryEyes'];
const RATES = Object.freeze({
  // Watery eyes precede tears; droplets gather rather than appearing instantly.
  wateryEyes: { rise: 8, fall: 2.5 },
  tears: { rise: 1.35, fall: 1.8 },
  // Embarrassment arrives quickly; sweat lingers briefly after exertion.
  blush: { rise: 4.5, fall: 2.1 },
  sweat: { rise: 2.8, fall: 0.85 },
});
function unit(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

/** The targets are pure gameplay state, independent of frame timing. */
export function calculateFacialEffectTargets(emotion, speed) {
  const velocity = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  const exertion = unit((velocity - 1.8) / 3.2);
  const crying = emotion === 'sad';
  return {
    tears: crying ? 0.85 : 0,
    blush: emotion === 'embarrassed' ? 0.75 : 0,
    sweat: Math.max(emotion === 'fear' ? 0.4 : 0, emotion === 'exerted' ? 0.75 : 0, exertion),
    wateryEyes: crying ? 1 : 0,
  };
}

/**
 * Attack/release exponential envelope. Separate rates make the eye surface
 * wet before tears form and let exertion sweat fade naturally after stopping.
 * Exact exponential integration is independent of render frame rate.
 */
export function stepFacialEffectWeights(current, target, seconds) {
  const dt = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const next = {};
  for (const channel of CHANNELS) {
    const from = unit(current?.[channel]);
    const to = unit(target?.[channel]);
    const rate = to > from ? RATES[channel].rise : RATES[channel].fall;
    next[channel] = unit(from + (to - from) * (1 - Math.exp(-rate * dt)));
  }
  return next;
}
