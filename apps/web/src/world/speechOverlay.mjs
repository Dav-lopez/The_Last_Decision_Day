/**
 * Independent facial-only speech for remote chat. No body animation clip is
 * required; the existing Talk morph articulation receives this fade envelope.
 */
export function stepSpeechOverlay(previous, speaking, seconds) {
  const dt = Number.isFinite(seconds) ? Math.min(0.1, Math.max(0, seconds)) : 0;
  const oldWeight = Number.isFinite(previous?.weight) ? Math.min(1, Math.max(0, previous.weight)) : 0;
  const oldElapsed = Number.isFinite(previous?.elapsed) && previous.elapsed >= 0 ? previous.elapsed : 0;
  const target = speaking === true ? 1 : 0;
  const weight = oldWeight + (target - oldWeight) * (1 - Math.exp(-12 * dt));
  if (!speaking && weight < 0.001) return { elapsed: 0, weight: 0 };
  return { elapsed: speaking ? oldElapsed + dt : oldElapsed, weight };
}
