/** Deterministic droplet motion; left and right sides are staggered. */
export function dropletCycle(seconds, kind, side) {
  if ((kind !== 'tear' && kind !== 'sweat') || (side !== 'Left' && side !== 'Right')) {
    throw new Error('Unknown facial droplet kind or side');
  }
  const elapsed = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const duration = kind === 'tear' ? 1.45 : 1.95;
  const offset = side === 'Right' ? 0.47 : 0;
  const phase = (elapsed / duration + offset) % 1;
  // Fade in at the eye/temple, then fade before the drop resets to the top.
  const opacity = Math.max(0, Math.min(1, phase / 0.14, (1 - phase) / 0.23));
  return { phase, opacity };
}
