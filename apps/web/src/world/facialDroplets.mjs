/** Deterministic droplet motion. Right-side drops begin later, not mid-cheek. */
export function dropletCycle(seconds, kind, side) {
  if ((kind !== 'tear' && kind !== 'sweat') || (side !== 'Left' && side !== 'Right')) {
    throw new Error('Unknown facial droplet kind or side');
  }
  const elapsed = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const duration = kind === 'tear' ? 1.45 : 1.95;
  // A phase offset made the right drop appear halfway down the face when
  // crying began. Delay its first emergence instead; both start at the duct.
  const delay = side === 'Right' ? duration * 0.28 : 0;
  const progress = (Math.max(0, elapsed - delay) / duration) % 1;
  // Droplets gather near the duct/temple before gravity accelerates their
  // descent. Sweat moves more slowly than tears. Opacity fades before reset,
  // avoiding a visible teleport at the end of each bead's track.
  const phase = progress ** (kind === 'tear' ? 1.5 : 1.85);
  const opacity = Math.max(0, Math.min(1, phase / 0.14, (1 - phase) / 0.23));
  return { phase, opacity };
}

/**
 * Clock for each effect type. A new crying/exertion episode starts at the
 * tear duct/temple, rather than inheriting an arbitrary world animation phase.
 * Keep running during the release envelope to avoid snapping a visible drop.
 */
export function stepDropletClock(previous, intensity, seconds) {
  if (!Number.isFinite(intensity) || intensity <= 0.02) {
    return { elapsed: 0, active: false };
  }
  const dt = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.1)) : 0;
  const prior = previous?.active && Number.isFinite(previous.elapsed) && previous.elapsed >= 0
    ? previous.elapsed : 0;
  return { elapsed: prior + dt, active: true };
}
