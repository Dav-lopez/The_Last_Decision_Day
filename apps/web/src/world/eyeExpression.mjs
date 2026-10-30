/** Keep emotional eyelid poses from fighting a closed blink on either eye. */
function unit(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

/**
 * Blend the already-smoothed emotional morph with the blink of the matching eye.
 * Only eye-wide/squint morphs are suppressed: mouth, cheek and brow expressions
 * must remain active throughout the blink.
 */
export function composeEyeExpression(name, expression, blink) {
  const value = unit(expression);
  if (!/^eye(?:Wide|Squint)(?:Left|Right)$/.test(name)) return value;
  const lid = name.endsWith('Left') ? blink?.left : blink?.right;
  return value * (1 - unit(lid));
}
