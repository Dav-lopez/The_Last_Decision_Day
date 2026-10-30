/**
 * Photo → house colours. A photo the player snaps or uploads is shrunk to a
 * few thousand pixels in the browser (nothing leaves the device), clustered
 * into a small palette, and the palette is turned into paint for their house:
 * walls, roof, trim, front door and the walls inside.
 */
const clamp01 = value => Math.min(1, Math.max(0, value));
const toHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(clamp01(v / 255) * 255).toString(16).padStart(2, '0')).join('');
export const hexToRgb = hex => {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};
/** Perceived lightness 0–1 and saturation 0–1 (HSL-style). */
export function describe([r, g, b]) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const lightness = (max + min) / 2;
  const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
  return { lightness, saturation: clamp01(saturation) };
}

/**
 * k-means over RGBA pixels (Uint8 / Uint8Clamped / plain array), deterministic.
 * Transparent pixels are
 * ignored. Returns colours sorted by share, each { hex, rgb, share }.
 */
export function extractPalette(pixels, count = 6, iterations = 10) {
  const points = [];
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    points.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
  }
  if (points.length === 0) return [];
  const k = Math.max(1, Math.min(count, points.length));
  // Farthest-point seeding: start at the median-lightness pixel, then keep adding the pixel
  // farthest from every seed so far, so small but distinct colours (a red door) get a cluster.
  const sorted = [...points].sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
  let centres = [[...sorted[Math.floor(sorted.length / 2)]]];
  const nearest = points.map(p => (p[0] - centres[0][0]) ** 2 + (p[1] - centres[0][1]) ** 2 + (p[2] - centres[0][2]) ** 2);
  while (centres.length < k) {
    let far = 0;
    for (let i = 1; i < points.length; i++) if (nearest[i] > nearest[far]) far = i;
    if (nearest[far] === 0) break; // fewer distinct colours than k
    const seed = [...points[far]];
    centres.push(seed);
    points.forEach((p, i) => { nearest[i] = Math.min(nearest[i], (p[0] - seed[0]) ** 2 + (p[1] - seed[1]) ** 2 + (p[2] - seed[2]) ** 2); });
  }
  let assignment = new Array(points.length).fill(0);
  for (let round = 0; round < iterations; round++) {
    const sums = centres.map(() => [0, 0, 0, 0]);
    points.forEach((p, index) => {
      let best = 0; let bestDistance = Infinity;
      centres.forEach((c, ci) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bestDistance) { bestDistance = d; best = ci; }
      });
      assignment[index] = best;
      const s = sums[best]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    });
    centres = centres.map((c, ci) => sums[ci][3] ? [sums[ci][0] / sums[ci][3], sums[ci][1] / sums[ci][3], sums[ci][2] / sums[ci][3]] : c);
  }
  const counts = centres.map(() => 0);
  for (const a of assignment) counts[a]++;
  return centres
    .map((rgb, i) => ({ rgb: rgb.map(Math.round), hex: toHex(rgb), share: counts[i] / points.length }))
    .filter(colour => colour.share > 0)
    .sort((a, b) => b.share - a.share);
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/**
 * Turn a palette into house paint. Walls: the most common mid-light colour
 * (sky and deep shadow are skipped); roof: the darkest notable colour; door:
 * the most saturated colour left; trim: the lightest. `variant` rotates the
 * choice so the player can try other combinations from the same photo.
 */
export function houseStyleFrom(palette, variant = 0) {
  const usable = (palette ?? []).filter(c => Array.isArray(c?.rgb) && c.rgb.length === 3 && c.rgb.every(Number.isFinite));
  if (usable.length === 0) return null;
  const info = usable.map(c => ({ ...c, ...describe(c.rgb) }));
  const wallCandidates = info.filter(c => c.lightness >= 0.25 && c.lightness <= 0.9);
  const ranked = (wallCandidates.length ? wallCandidates : info);
  const walls = ranked[((variant % ranked.length) + ranked.length) % ranked.length];
  const rest = info.filter(c => c !== walls);
  const pool = rest.length ? rest : [walls];
  const roof = [...pool].sort((a, b) => a.lightness - b.lightness)[0];
  const afterRoof = pool.filter(c => c !== roof);
  const doorPool = afterRoof.length ? afterRoof : pool;
  const door = [...doorPool].sort((a, b) => b.saturation - a.saturation)[0];
  const trimPool = doorPool.filter(c => c !== door);
  const lightest = [...(trimPool.length ? trimPool : info)].sort((a, b) => b.lightness - a.lightness)[0];
  // Trim reads as trim only when it's light: lift it toward white.
  const trim = mix(lightest.rgb, [245, 243, 236], lightest.lightness > 0.75 ? 0.2 : 0.6);
  // Inside, the same colour family but paler, as interior paint usually is.
  const interior = mix(walls.rgb, [246, 241, 232], 0.55);
  return Object.freeze({
    walls: toHex(walls.rgb), roof: toHex(roof.rgb), door: toHex(door.rgb), trim: toHex(trim), interior: toHex(interior),
    swatches: Object.freeze(usable.map(c => c.hex)),
  });
}

const KEY = 'tld-house-style-v1:';
const ROLES = ['walls', 'roof', 'door', 'trim', 'interior'];
export function readHouseStyle(characterId, storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(KEY + characterId) ?? 'null');
    if (!value || !ROLES.every(role => hexToRgb(value[role]))) return null;
    return Object.freeze({ ...Object.fromEntries(ROLES.map(role => [role, value[role].toLowerCase()])), swatches: Object.freeze((value.swatches ?? []).filter(hexToRgb)) });
  } catch { return null; }
}
export function writeHouseStyle(characterId, style, storage = globalThis.localStorage) {
  try {
    if (style) storage?.setItem(KEY + characterId, JSON.stringify(style));
    else storage?.removeItem(KEY + characterId);
  } catch { /* private mode: the paint lasts for this visit only */ }
}

/** Which paint a house surface takes, from its material name (procedural and the authored house.glb). */
export function roleForMaterial(name) {
  const n = String(name ?? '').toLowerCase();
  if (/glass|window|shutter|metal|foundation|brick|path|porch landing/.test(n)) return null;
  if (/roof|shingle/.test(n)) return 'roof';
  if (/door/.test(n) && !/garage/.test(n)) return 'door';
  if (/trim|sill|frame/.test(n)) return 'trim';
  if (/siding|wall|home$/.test(n)) return 'walls';
  return null;
}
