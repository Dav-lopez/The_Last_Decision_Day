// Keyboard flow for the game's overlays (MVP 7b): which element gets focus next.
// Pure index arithmetic, so the rules are testable without a browser.

/**
 * Tab-list keys (the WAI-ARIA tabs pattern): arrows move with wrap-around,
 * Home and End jump to the ends. Disabled tabs are skipped.
 * Returns the index to select, or null when the key is not a tab-list key.
 * @param {string} key
 * @param {number} index current tab
 * @param {ReadonlyArray<boolean>} enabled one flag per tab
 * @param {'horizontal' | 'vertical'} [orientation]
 */
export function tabListTarget(key, index, enabled, orientation = 'horizontal') {
  const count = enabled.length;
  if (!count || !enabled.some(Boolean)) return null;
  const forward = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
  const back = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
  let start, step;
  if (key === forward) { start = index + 1; step = 1; }
  else if (key === back) { start = index - 1; step = -1; }
  else if (key === 'Home') { start = 0; step = 1; }
  else if (key === 'End') { start = count - 1; step = -1; }
  else return null;
  for (let i = 0; i < count; i++) {
    const at = (((start + i * step) % count) + count) % count;
    if (enabled[at]) return at;
  }
  return null;
}

/**
 * Focus trap for a modal overlay: Tab on the last control wraps to the first,
 * Shift+Tab on the first wraps to the last, and focus that has escaped the
 * overlay (index -1) comes back in. Returns the index to focus, or null to let
 * the browser move focus normally.
 * @param {number} index focused control inside the overlay, -1 when outside
 * @param {number} count focusable controls in the overlay
 * @param {boolean} shift
 */
export function trapTarget(index, count, shift) {
  if (count <= 0) return null;
  if (index < 0) return shift ? count - 1 : 0;
  if (shift && index === 0) return count - 1;
  if (!shift && index === count - 1) return 0;
  return null;
}

/**
 * Where focus starts when an overlay opens: an element marked as the
 * preferred start wins, otherwise the first control.
 * @param {ReadonlyArray<boolean>} preferred one flag per focusable control
 */
export function initialFocus(preferred) {
  if (!preferred.length) return -1;
  const marked = preferred.indexOf(true);
  return marked >= 0 ? marked : 0;
}

/**
 * Keyboard GPS: the map's places you can route to without a mouse, nearest
 * first, skipping "you" and anything without a position.
 * @template {{ id: string; label: string; x: number; z: number; kind: string }} M
 * @param {ReadonlyArray<M>} markers
 * @param {{ x: number; z: number } | null} you
 * @returns {M[]}
 */
export function gpsDestinations(markers, you) {
  const places = markers.filter(m => m.kind !== 'you' && Number.isFinite(m.x) && Number.isFinite(m.z));
  if (!you) return places;
  const distance = m => Math.hypot(m.x - you.x, m.z - you.z);
  return places.map((m, order) => ({ m, order, d: distance(m) }))
    .sort((a, b) => a.d - b.d || a.order - b.order)
    .map(item => item.m);
}
