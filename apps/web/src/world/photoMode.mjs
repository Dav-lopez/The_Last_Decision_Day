/**
 * Phone camera / photo mode (open-world item 14b): pure rules for filters, zoom, keys, the stamp printed on
 * each photo and the small gallery kept in this browser. No DOM or Babylon here, so it runs under node:test.
 *
 * Filters are made from the same operations as CSS filters (brightness, contrast, saturate, sepia, grayscale),
 * so the live viewfinder preview (a CSS filter on the 3D canvas) and the saved photo (these pixel formulas)
 * look the same, and Safari, which has no canvas `ctx.filter`, gets identical photos.
 */

export const PHOTO_FILTERS = Object.freeze([
  Object.freeze({ id: 'natural', name: 'Natural', ops: Object.freeze([]), vignette: 0 }),
  Object.freeze({ id: 'golden', name: 'Golden hour', ops: Object.freeze([['sepia', 0.3], ['saturate', 1.3], ['brightness', 1.05]]), vignette: 0.25 }),
  Object.freeze({ id: 'vivid', name: 'Vivid', ops: Object.freeze([['saturate', 1.55], ['contrast', 1.12]]), vignette: 0.1 }),
  Object.freeze({ id: 'mono', name: 'Black & white', ops: Object.freeze([['grayscale', 1], ['contrast', 1.18]]), vignette: 0.3 }),
  Object.freeze({ id: 'film', name: 'Faded film', ops: Object.freeze([['contrast', 0.86], ['brightness', 1.08], ['saturate', 0.75], ['sepia', 0.18]]), vignette: 0.35 }),
]);

export const ZOOM = Object.freeze({ min: 1, max: 3, step: 0.25 });
/** Photos kept per character; the oldest goes when a new one would exceed this. */
export const PHOTO_LIMIT = 8;
/** Longest side of a saved photo, in pixels (keeps the gallery small enough for browser storage). */
export const PHOTO_MAX_SIDE = 960;
/** How far one key press turns (radians) or tilts the camera. */
export const ORBIT_STEP = 0.09;

export function filterById(id) {
  return PHOTO_FILTERS.find(filter => filter.id === id) ?? PHOTO_FILTERS[0];
}

/** The next (or, with step -1, previous) filter, wrapping round. */
export function nextFilter(id, step = 1) {
  const index = PHOTO_FILTERS.findIndex(filter => filter.id === id);
  const from = index < 0 ? 0 : index;
  return PHOTO_FILTERS[((from + step) % PHOTO_FILTERS.length + PHOTO_FILTERS.length) % PHOTO_FILTERS.length];
}

/** The CSS `filter` value that previews a filter on the live view. */
export function filterCss(id) {
  const { ops } = filterById(id);
  return ops.length ? ops.map(([op, amount]) => `${op}(${amount})`).join(' ') : 'none';
}

export function clampZoom(zoom) {
  if (!Number.isFinite(zoom)) return ZOOM.min;
  return Math.min(ZOOM.max, Math.max(ZOOM.min, Math.round(zoom / ZOOM.step) * ZOOM.step));
}

/** Field of view (radians) that magnifies a base field of view by `zoom`. */
export function fovForZoom(baseFov, zoom) {
  return 2 * Math.atan(Math.tan(baseFov / 2) / clampZoom(zoom));
}

/**
 * What a key does in photo mode (`key` as KeyboardEvent.key). Movement keys aim the camera instead of walking,
 * so the player stands still for the picture.
 */
export function photoKeyAction(key, shift = false) {
  const k = typeof key === 'string' && key.length === 1 ? key.toLowerCase() : key;
  switch (k) {
    case ' ': case 'Enter': return 'shoot';
    case 'f': return shift ? 'filter-back' : 'filter';
    case '+': case '=': case 'z': return 'zoom-in';
    case '-': case '_': case 'x': return 'zoom-out';
    case 'a': case 'ArrowLeft': return 'turn-left';
    case 'd': case 'ArrowRight': return 'turn-right';
    case 'w': case 'ArrowUp': return 'tilt-up';
    case 's': case 'ArrowDown': return 'tilt-down';
    case 'g': return 'grid';
    case 'Escape': case 'p': case 'c': return 'exit';
    default: return null;
  }
}

/** Turns/tilts an orbit camera ({ alpha, beta }) for an aim action, keeping beta inside its limits. */
export function aimCamera(view, action, limits = { lower: 0.25, upper: 1.5 }) {
  const { alpha, beta } = view;
  if (action === 'turn-left') return { alpha: alpha + ORBIT_STEP, beta };
  if (action === 'turn-right') return { alpha: alpha - ORBIT_STEP, beta };
  const tilt = action === 'tilt-up' ? ORBIT_STEP : action === 'tilt-down' ? -ORBIT_STEP : 0;
  return { alpha, beta: Math.min(limits.upper, Math.max(limits.lower, beta + tilt)) };
}

/** Output size for a capture of a `width` × `height` view, never larger than `maxSide` on its longest side. */
export function captureSize(width, height, maxSide = PHOTO_MAX_SIDE) {
  const w = Math.max(1, Math.round(width || 1)), h = Math.max(1, Math.round(height || 1));
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

const PLACES = Object.freeze({ street: 'Maple Street', home: 'Home', school: 'School', city: 'Downtown Boulder' });

/** The small caption printed in the corner of each photo, e.g. "Day 3 · 6:20 PM · Maple Street". */
export function photoStamp({ day, clock, place }) {
  const where = PLACES[place] ?? (typeof place === 'string' && place.trim() ? place.trim().slice(0, 40) : 'Maple Street');
  return `Day ${Math.max(1, Math.floor(Number(day) || 1))} · ${String(clock ?? '').trim() || '—'} · ${where}`;
}

/** A download file name such as "last-decision-day-day3-0620pm-2.jpg". */
export function photoFileName({ day, clock, index = 1 }) {
  const time = String(clock ?? '').toLowerCase().replace(/[^0-9apm]/g, '') || 'photo';
  return `last-decision-day-day${Math.max(1, Math.floor(Number(day) || 1))}-${time}-${Math.max(1, Math.floor(index))}.jpg`;
}

// ---- Pixel filters (CSS Filter Effects formulas, linear on 0–255 sRGB values like browsers do) ----

const clamp255 = value => value < 0 ? 0 : value > 255 ? 255 : value;

function matrixFor(op, amount) {
  if (op === 'saturate') {
    const s = amount;
    return [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
      0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
      0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s];
  }
  if (op === 'grayscale') {
    const g = 1 - Math.min(1, Math.max(0, amount));
    return [0.2126 + 0.7874 * g, 0.7152 - 0.7152 * g, 0.0722 - 0.0722 * g,
      0.2126 - 0.2126 * g, 0.7152 + 0.2848 * g, 0.0722 - 0.0722 * g,
      0.2126 - 0.2126 * g, 0.7152 - 0.7152 * g, 0.0722 + 0.9278 * g];
  }
  if (op === 'sepia') {
    const s = 1 - Math.min(1, Math.max(0, amount));
    return [0.393 + 0.607 * s, 0.769 - 0.769 * s, 0.189 - 0.189 * s,
      0.349 - 0.349 * s, 0.686 + 0.314 * s, 0.168 - 0.168 * s,
      0.272 - 0.272 * s, 0.534 - 0.534 * s, 0.131 + 0.869 * s];
  }
  return null;
}

/** One RGB triple through a filter's operations (values 0–255). */
export function filterPixel(rgb, id) {
  let [r, g, b] = rgb;
  for (const [op, amount] of filterById(id).ops) {
    const m = matrixFor(op, amount);
    if (m) {
      const nr = m[0] * r + m[1] * g + m[2] * b, ng = m[3] * r + m[4] * g + m[5] * b, nb = m[6] * r + m[7] * g + m[8] * b;
      r = nr; g = ng; b = nb;
    } else if (op === 'brightness') { r *= amount; g *= amount; b *= amount; }
    else if (op === 'contrast') {
      const off = 127.5 * (1 - amount);
      r = r * amount + off; g = g * amount + off; b = b * amount + off;
    }
    r = clamp255(r); g = clamp255(g); b = clamp255(b);
  }
  return [Math.round(r), Math.round(g), Math.round(b)];
}

/**
 * Applies a filter (and its soft vignette) in place to RGBA pixel data of a `width` × `height` image.
 * Uses a 32 768-entry colour cache, so a 960 × 540 photo takes a few milliseconds.
 */
export function applyPhotoFilter(data, width, height, id) {
  const filter = filterById(id);
  if (!filter.ops.length && !filter.vignette) return data;
  const cache = new Map();
  const cx = (width - 1) / 2, cy = (height - 1) / 2;
  const reach = Math.hypot(cx, cy) || 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let r = data[i], g = data[i + 1], b = data[i + 2];
      if (filter.ops.length) {
        // Quantise to 5 bits per channel for the cache key, but filter the exact colour on a miss.
        const key = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3);
        let out = cache.get(key);
        if (!out) { out = filterPixel([r, g, b], filter.id); if (cache.size < 32768) cache.set(key, out); }
        [r, g, b] = out;
      }
      if (filter.vignette) {
        const d = Math.hypot(x - cx, y - cy) / reach;
        const shade = 1 - filter.vignette * Math.max(0, (d - 0.55) / 0.45) ** 2;
        r *= shade; g *= shade; b *= shade;
      }
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
    }
  }
  return data;
}

// ---- Gallery (newest first), kept in this browser per character ----

const KEY = characterId => `tld-photos-v1:${characterId}`;
const isPhoto = value => value && typeof value === 'object' && typeof value.id === 'string' && typeof value.src === 'string'
  && value.src.startsWith('data:image/') && typeof value.stamp === 'string';

export function normalizeGallery(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const photos = [];
  for (const item of value) {
    if (!isPhoto(item) || seen.has(item.id)) continue;
    seen.add(item.id);
    photos.push({ id: item.id.slice(0, 64), src: item.src, stamp: item.stamp.slice(0, 80), name: typeof item.name === 'string' ? item.name.slice(0, 80) : `${item.id}.jpg`,
      filter: filterById(item.filter).id });
    if (photos.length >= PHOTO_LIMIT) break;
  }
  return photos;
}

/** Adds a photo at the front, dropping the oldest beyond `limit`. */
export function addPhoto(gallery, photo, limit = PHOTO_LIMIT) {
  return [photo, ...gallery.filter(p => p.id !== photo.id)].slice(0, Math.max(1, limit));
}

export function removePhoto(gallery, id) {
  return gallery.filter(photo => photo.id !== id);
}

export function readGallery(characterId, storage = globalThis.localStorage) {
  try { return normalizeGallery(JSON.parse(storage?.getItem(KEY(characterId)) ?? 'null')); } catch { return []; }
}

/**
 * Saves the gallery; when browser storage is full it drops the oldest photos until it fits.
 * Returns the photos kept (a single photo too big to store still shows for this session).
 */
export function writeGallery(characterId, gallery, storage = globalThis.localStorage) {
  let kept = gallery.slice(0, PHOTO_LIMIT);
  for (;;) {
    try {
      if (kept.length) storage?.setItem(KEY(characterId), JSON.stringify(kept));
      else storage?.removeItem?.(KEY(characterId));
      return kept;
    } catch {
      if (kept.length <= 1) return kept;
      kept = kept.slice(0, -1);
    }
  }
}
