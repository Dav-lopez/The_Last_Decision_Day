/**
 * Text contrast for the HUD (WCAG 2.x). The HUD floats over a live 3D scene,
 * so a panel's background is only as good as whatever shows through it: every
 * check composites the panel layers over both a black and a white backdrop and
 * keeps the worse result, so text stays readable over night sky and snow alike.
 */

/** Parses `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()` / `rgba()` (comma or space syntax). Null if unknown. */
export function parseColor(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase();
  if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([0-9a-f]{3,8})$/.exec(text);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) digits = [...digits].map(d => d + d).join('');
    if (digits.length !== 6 && digits.length !== 8) return null;
    const n = i => parseInt(digits.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: digits.length === 8 ? n(6) / 255 : 1 };
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(text);
  if (!fn) return null;
  const parts = fn[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const channel = p => p.endsWith('%') ? parseFloat(p) * 2.55 : parseFloat(p);
  const alpha = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  const color = { r: channel(parts[0]), g: channel(parts[1]), b: channel(parts[2]), a: alpha };
  return Object.values(color).every(Number.isFinite) ? color : null;
}

/** `top` drawn over `bottom` (straight alpha). */
export function composite(top, bottom) {
  const a = top.a + bottom.a * (1 - top.a);
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = k => (top[k] * top.a + bottom[k] * bottom.a * (1 - top.a)) / a;
  return { r: mix('r'), g: mix('g'), b: mix('b'), a };
}

export function relativeLuminance({ r, g, b }) {
  const lin = c => { const s = Math.min(255, Math.max(0, c)) / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Contrast ratio between two opaque colours, 1–21. */
export function contrastRatio(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export const BACKDROPS = Object.freeze([
  Object.freeze({ r: 0, g: 0, b: 0, a: 1 }),
  Object.freeze({ r: 255, g: 255, b: 255, a: 1 }),
]);

/**
 * Worst-case contrast of `text` over `layers` (background colours, innermost
 * first, as strings or parsed colours) on any backdrop. Returns the ratio and
 * the backdrop it failed worst on.
 */
export function worstContrast(text, layers = [], backdrops = BACKDROPS) {
  const fg = typeof text === 'string' ? parseColor(text) : text;
  if (!fg) return { ratio: NaN, backdrop: null };
  const parsed = layers.map(layer => typeof layer === 'string' ? parseColor(layer) : layer).filter(Boolean);
  let worst = { ratio: Infinity, backdrop: null };
  for (const backdrop of backdrops) {
    // Outermost layer first onto the backdrop, then inwards.
    const bg = parsed.reduceRight((under, layer) => composite(layer, under), backdrop);
    const ratio = contrastRatio(composite(fg, bg), bg);
    if (ratio < worst.ratio) worst = { ratio, backdrop };
  }
  return worst;
}

/** WCAG large text: at least 24 px, or 18.66 px (14 pt) and bold. */
export function isLargeText(fontSizePx, fontWeight = 400) {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && Number(fontWeight) >= 700);
}

/** The AA minimum for this text: 4.5:1, or 3:1 for large text. */
export function requiredContrast(fontSizePx, fontWeight = 400) {
  return isLargeText(fontSizePx, fontWeight) ? 3 : 4.5;
}

/**
 * Judges one sample `{ label, color, layers, fontSize, fontWeight, overScene }`
 * from the page (`overScene: false` for text outside the 3D view). Returns
 * null when it passes, otherwise a finding with the numbers.
 */
export function auditSample(sample) {
  // Text outside the 3D view sits on the page itself, whose last layer is opaque (or the browser's white).
  const backdrops = sample.overScene === false ? [BACKDROPS[1]] : BACKDROPS;
  const { ratio, backdrop } = worstContrast(sample.color, sample.layers ?? [], backdrops);
  const needed = requiredContrast(sample.fontSize ?? 16, sample.fontWeight ?? 400);
  if (!(ratio < needed)) return null;
  return {
    label: sample.label,
    ratio: Math.round(ratio * 100) / 100,
    needed,
    over: sample.overScene === false ? 'page' : backdrop && backdrop.r === 0 ? 'dark scene' : 'bright scene',
  };
}
