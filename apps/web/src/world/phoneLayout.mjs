/**
 * Phone layout rules, checked by the phone-viewport playtest against what the
 * browser actually laid out. Kept pure so the rules themselves are unit-tested.
 *
 * Elements are { name, kind: 'hud' | 'target', rect: { x, y, width, height } }.
 * - The page must never scroll sideways.
 * - Every element must sit fully inside the screen horizontally.
 * - Touch targets (buttons the player taps) must be at least `minTarget` px tall and wide.
 * - Overlays drawn over the 3D view (HUD and targets inside it) must not cover each other.
 */
export const MIN_TOUCH_TARGET = 40;
/** A pixel of slack covers sub-pixel rounding in the browser. */
const SLACK = 1;

/** True when two rectangles overlap by more than the slack in both directions. */
export function overlaps(a, b) {
  const x = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const y = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return x > SLACK && y > SLACK;
}

/**
 * Returns human-readable layout problems; an empty list means the layout fits.
 * `overlays` names the elements drawn over the 3D view that must not cover each other.
 */
export function layoutProblems({ viewport, documentWidth, elements, overlays = [], minTarget = MIN_TOUCH_TARGET }) {
  const problems = [];
  if (documentWidth > viewport.width + SLACK) {
    problems.push(`page scrolls sideways: ${Math.round(documentWidth)}px wide on a ${viewport.width}px screen`);
  }
  for (const { name, kind, rect } of elements) {
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (rect.x < -SLACK || rect.x + rect.width > viewport.width + SLACK) {
      problems.push(`${name} runs off the screen (${Math.round(rect.x)}–${Math.round(rect.x + rect.width)}px)`);
    }
    if (kind === 'target' && (rect.width < minTarget - SLACK || rect.height < minTarget - SLACK)) {
      problems.push(`${name} is too small to tap (${Math.round(rect.width)}×${Math.round(rect.height)}px, needs ${minTarget})`);
    }
  }
  const layered = elements.filter(element => overlays.includes(element.name) && element.rect.width > 0 && element.rect.height > 0);
  for (let i = 0; i < layered.length; i++) {
    for (let j = i + 1; j < layered.length; j++) {
      if (overlaps(layered[i].rect, layered[j].rect)) problems.push(`${layered[i].name} covers ${layered[j].name}`);
    }
  }
  return problems;
}
