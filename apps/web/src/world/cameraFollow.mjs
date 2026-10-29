/** Exponential camera follow with a time-based half-life, independent of FPS. */
export function cameraFollowAlpha(elapsedSeconds, halfLifeSeconds = 0.09) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 0;
  if (!Number.isFinite(halfLifeSeconds) || halfLifeSeconds <= 0) return 0;
  return 1 - Math.exp(-Math.LN2 * elapsedSeconds / halfLifeSeconds);
}
