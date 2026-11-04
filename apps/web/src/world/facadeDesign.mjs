// Downtown facades (open-world 20a): which look each real building gets, the window layout of every style,
// which windows are lit at night, rooftop plant and shop awnings. Pure data and Canvas 2D drawing, so the same
// art can be checked in node tests and rendered outside Babylon.
import { pointInRing, ringArea } from './cityLayout.mjs';

/** One facade texture covers four window bays by four storeys; the walls tile it. */
export const FACADE_TILE = Object.freeze({ bays: 4, floors: 4, bay: 3.2, floor: 3.4 });

/**
 * Window layout per style, in a 0..1 bay cell (y from the top of the storey): glass, its frame, a lintel
 * above, a sill below, mullions, and decoration (shutters, spandrel bands).
 */
export const FACADE_STYLES = Object.freeze({
  brick: { wall: '#9a4a36', mortar: '#7a3a2a', window: '#3d5466', frame: '#e8e1d2', trim: '#d9cfbb', storefront: true,
    pattern: 'brick', glass: [0.27, 0.22, 0.73, 0.74], sash: 0.47, mullion: true, lintel: true, sill: true },
  tan: { wall: '#c9ad86', mortar: '#b29673', window: '#3a5566', frame: '#f2ece0', trim: '#efe5d2', storefront: true,
    pattern: 'stucco', glass: [0.22, 0.24, 0.78, 0.72], sash: 0, mullion: true, lintel: false, sill: true, band: true },
  house: { wall: '#c7cfd4', mortar: '#a9b2b8', window: '#456173', frame: '#ffffff', trim: '#f4f6f7', storefront: false,
    pattern: 'siding', glass: [0.32, 0.26, 0.68, 0.7], sash: 0.48, mullion: false, lintel: false, sill: true, shutters: '#3c5a4a' },
  stone: { wall: '#d7d0bf', mortar: '#bcb4a2', window: '#30465a', frame: '#efe9dc', trim: '#e6dfcd', storefront: false,
    pattern: 'ashlar', glass: [0.31, 0.13, 0.69, 0.8], sash: 0.36, mullion: true, lintel: true, sill: true },
  modern: { wall: '#6f7c86', mortar: '#5f6b74', window: '#28404f', frame: '#b9c3ca', trim: '#c9d2d8', storefront: true,
    pattern: 'curtain', glass: [0.03, 0.06, 0.97, 0.8], sash: 0, mullion: true, lintel: false, sill: false },
});

const CIVIC = ['civic', 'government', 'public', 'church', 'school', 'university'];
const HOMES = ['house', 'detached', 'residential', 'terrace', 'garage', 'garages', 'shed'];

/** @param {{ id: number; kind: string; name: string; height: number }} building */
export function facadeStyleFor(building) {
  if (CIVIC.includes(building.kind) || /Courthouse|Library|Municipal|Post Office/.test(building.name)) return 'stone';
  if (HOMES.includes(building.kind)) return 'house';
  if (building.height > 18 || building.kind === 'office' || building.kind === 'hotel') return 'modern';
  return building.id % 3 === 0 ? 'tan' : 'brick';
}

/** A small, fast, seeded random stream (mulberry32). */
export function seeded(seed) {
  let state = (Math.floor(seed) ^ 0x9e3779b9) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The per-building variation on top of its style: a slight colour shift (paint and brick are never all one
 * batch), where the window grid starts along the wall (so neighbours don't line up), and the parapet height.
 */
export function facadeVariant(building) {
  const style = facadeStyleFor(building);
  const next = seeded(building.id);
  const shade = 0.88 + next() * 0.16;
  const warm = (next() - 0.5) * 0.08;
  const tint = [shade * (1 + warm), shade, shade * (1 - warm)].map(v => Math.round(Math.min(1.08, v) * 1000) / 1000);
  const bayShift = Math.floor(next() * FACADE_TILE.bays);
  const parapet = style === 'house' ? 0 : style === 'modern' ? 0.9 : 0.45 + Math.round(next() * 4) / 10;
  return { style, tint, bayShift, parapet };
}

/**
 * Which windows of the tile are lit at night (floor 0 is the bottom row) and how warm each lamp is
 * (0 = cool white, 1 = warm tungsten). About `share` of them are on.
 */
export function litWindows(seed, share = 0.38) {
  const next = seeded(seed * 7 + 3);
  const grid = [];
  for (let floor = 0; floor < FACADE_TILE.floors; floor++) {
    const row = [];
    for (let bay = 0; bay < FACADE_TILE.bays; bay++) row.push({ lit: next() < share, warmth: next(), blind: next() < 0.3 });
    grid.push(row);
  }
  return grid;
}

const SKY_TOP = '#a9c3d6';
/** Night colour of a lit window: warm tungsten to cool LED. */
export function windowGlow(warmth, modern = false) {
  const w = modern ? warmth * 0.55 : 0.35 + warmth * 0.65;
  const r = Math.round(255);
  const g = Math.round(206 + (1 - w) * 40);
  const b = Math.round(130 + (1 - w) * 110);
  return `rgb(${r},${g},${b})`;
}

/**
 * Draws one facade tile (4 bays × 4 storeys) into a Canvas 2D context of `size` px.
 * mode 'day' is the colour map, 'night' the emissive map (lit windows only), 'gloss' the specular map
 * (glass shines, walls don't). The same window rectangles are used by all three so they line up.
 */
export function drawFacade(ctx, styleName, size, mode = 'day', lit = litWindows(1)) {
  const style = FACADE_STYLES[styleName];
  const cell = size / FACADE_TILE.bays;
  const rows = FACADE_TILE.floors;
  const next = seeded(styleName.length * 131 + 7);
  ctx.fillStyle = mode === 'day' ? style.wall : mode === 'gloss' ? (style.pattern === 'curtain' ? '#3a3a3a' : '#0d0d0d') : '#000000';
  ctx.fillRect(0, 0, size, size);
  if (mode === 'day') drawWallPattern(ctx, style, size, next);

  const [gx0, gy0, gx1, gy1] = style.glass;
  for (let floor = 0; floor < rows; floor++) {
    const top = (rows - 1 - floor) * cell;
    for (let bay = 0; bay < FACADE_TILE.bays; bay++) {
      const left = bay * cell;
      const x0 = left + gx0 * cell; const y0 = top + gy0 * cell;
      const w = (gx1 - gx0) * cell; const h = (gy1 - gy0) * cell;
      const pad = Math.max(1, cell * 0.035);
      const state = lit[floor]?.[bay] ?? { lit: false, warmth: 0.5, blind: false };
      if (mode === 'day') {
        if (style.pattern === 'curtain') {
          ctx.fillStyle = style.mortar; // spandrel band under each storey's glass
          ctx.fillRect(left, top + gy1 * cell, cell, (1 - gy1 + gy0) * cell);
        }
        if (style.lintel) { ctx.fillStyle = style.trim; ctx.fillRect(x0 - pad * 2.2, y0 - pad * 3, w + pad * 4.4, pad * 2.2); }
        if (style.sill) { ctx.fillStyle = style.trim; ctx.fillRect(x0 - pad * 2, y0 + h + pad * 0.6, w + pad * 4, pad * 1.8); }
        if (style.shutters) {
          ctx.fillStyle = style.shutters;
          ctx.fillRect(x0 - pad - w * 0.36, y0, w * 0.32, h);
          ctx.fillRect(x0 + w + pad + w * 0.04, y0, w * 0.32, h);
        }
        ctx.fillStyle = style.frame;
        ctx.fillRect(x0 - pad, y0 - pad, w + pad * 2, h + pad * 2);
        // Glass catches the sky: lighter at the top, a soft diagonal sheen, sometimes a blind half down.
        const sky = ctx.createLinearGradient(0, y0, 0, y0 + h);
        sky.addColorStop(0, SKY_TOP);
        sky.addColorStop(0.45, style.window);
        sky.addColorStop(1, shade(style.window, 0.8));
        ctx.fillStyle = sky;
        ctx.fillRect(x0, y0, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.beginPath();
        ctx.moveTo(x0 + w * 0.15, y0); ctx.lineTo(x0 + w * 0.42, y0); ctx.lineTo(x0 + w * 0.12, y0 + h); ctx.lineTo(x0, y0 + h); ctx.lineTo(x0, y0 + h * 0.6);
        ctx.closePath(); ctx.fill();
        if (state.blind) { ctx.fillStyle = 'rgba(232,226,210,0.85)'; ctx.fillRect(x0, y0, w, h * (0.25 + state.warmth * 0.35)); }
      } else if (mode === 'night') {
        if (state.lit) {
          const glow = ctx.createLinearGradient(0, y0, 0, y0 + h);
          glow.addColorStop(0, windowGlow(state.warmth, style.pattern === 'curtain'));
          glow.addColorStop(1, shade(windowGlow(state.warmth, style.pattern === 'curtain'), 0.62));
          ctx.fillStyle = glow;
          ctx.fillRect(x0, y0, w, h);
          if (state.blind) { ctx.fillStyle = 'rgba(120,96,60,0.55)'; ctx.fillRect(x0, y0, w, h * (0.25 + state.warmth * 0.35)); }
        } else {
          ctx.fillStyle = '#06080b'; // a hint of sky in dark glass
          ctx.fillRect(x0, y0, w, h);
        }
      } else {
        ctx.fillStyle = '#c4c8cc';
        ctx.fillRect(x0, y0, w, h);
      }
      // Glazing bars over the glass (dark at night, matte in the gloss map).
      ctx.fillStyle = mode === 'day' ? style.frame : '#000000';
      const bar = Math.max(1, cell * 0.03);
      if (style.mullion) ctx.fillRect(x0 + w / 2 - bar / 2, y0, bar, h);
      if (style.sash) ctx.fillRect(x0, y0 + h * style.sash - bar / 2, w, bar);
    }
  }
  if (mode === 'day' && style.band) {
    ctx.fillStyle = style.trim; // a string course along every floor line
    for (let floor = 0; floor < rows; floor++) ctx.fillRect(0, floor * cell + cell - Math.max(2, cell * 0.04), size, Math.max(2, cell * 0.04));
  }
}

function drawWallPattern(ctx, style, size, next) {
  if (style.pattern === 'brick') {
    const course = size / 64; const brick = course * 2.6;
    for (let row = 0, y = 0; y < size; row++, y += course) {
      for (let x = row % 2 ? -brick / 2 : 0; x < size; x += brick) {
        ctx.fillStyle = shade(style.wall, 0.9 + next() * 0.2);
        ctx.fillRect(x + 0.6, y + 0.6, brick - 1.2, course - 1.2);
      }
    }
  } else if (style.pattern === 'ashlar') {
    const course = size / 20; const block = course * 2.4;
    for (let row = 0, y = 0; y < size; row++, y += course) {
      for (let x = row % 2 ? -block / 2 : 0; x < size; x += block) {
        ctx.fillStyle = shade(style.wall, 0.95 + next() * 0.09);
        ctx.fillRect(x + 1, y + 1, block - 2, course - 2);
      }
    }
  } else if (style.pattern === 'siding') {
    const board = size / 36;
    for (let y = 0; y < size; y += board) {
      ctx.fillStyle = shade(style.wall, 1.04); ctx.fillRect(0, y, size, board * 0.4);
      ctx.fillStyle = style.mortar; ctx.fillRect(0, y + board - 1.2, size, 1.2);
    }
  } else if (style.pattern === 'stucco') {
    for (let i = 0; i < size * 6; i++) {
      ctx.fillStyle = shade(style.wall, 0.93 + next() * 0.14);
      ctx.fillRect(next() * size, next() * size, 1 + next() * 2, 1 + next() * 2);
    }
  } else if (style.pattern === 'curtain') {
    ctx.fillStyle = style.mortar;
    for (let x = 0; x < size; x += size / 4) ctx.fillRect(x, 0, Math.max(2, size / 128), size);
  }
}

/** Scales a #rrggbb or rgb() colour's brightness. */
export function shade(colour, factor) {
  let r; let g; let b;
  const rgb = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(colour);
  if (rgb) [r, g, b] = rgb.slice(1).map(Number);
  else { const n = parseInt(colour.slice(1), 16); r = n >> 16; g = (n >> 8) & 255; b = n & 255; }
  const c = v => Math.max(0, Math.min(255, Math.round(v * factor)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

/**
 * Rooftop plant on flat roofs: air-conditioning boxes, and a stair / lift housing on tall blocks. Every box sits
 * wholly inside the footprint with a margin, so nothing hangs over the edge.
 * @returns {Array<{ x: number; z: number; width: number; depth: number; height: number; kind: 'unit' | 'housing' }>}
 */
export function rooftopUnits(building) {
  const style = facadeStyleFor(building);
  const area = Math.abs(ringArea(building.ring));
  if (style === 'house' || area < 120) return [];
  const next = seeded(building.id * 13 + 5);
  const xs = building.ring.map(p => p[0]); const zs = building.ring.map(p => p[1]);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minZ = Math.min(...zs); const maxZ = Math.max(...zs);
  const fits = (x, z, w, d, others) => {
    const m = 1.2; // margin from the parapet
    for (const [cx, cz] of [[x - w / 2 - m, z - d / 2 - m], [x + w / 2 + m, z - d / 2 - m], [x + w / 2 + m, z + d / 2 + m], [x - w / 2 - m, z + d / 2 + m], [x, z]]) {
      if (!pointInRing(cx, cz, building.ring)) return false;
    }
    return others.every(o => Math.abs(o.x - x) > (o.width + w) / 2 + 0.6 || Math.abs(o.z - z) > (o.depth + d) / 2 + 0.6);
  };
  const units = [];
  const place = (count, size) => {
    for (let tries = 0, placed = 0; placed < count && tries < count * 16; tries++) {
      const [width, depth, height, kind] = size();
      const x = minX + next() * (maxX - minX); const z = minZ + next() * (maxZ - minZ);
      if (!fits(x, z, width, depth, units)) continue;
      units.push({ x: round(x), z: round(z), width, depth, height, kind });
      placed++;
    }
  };
  if (building.height > 14) place(1, () => [3.2, 3.6, 2.7, 'housing']);
  place(Math.max(1, Math.min(6, Math.round(area / 260))), () => [round(1.2 + next() * 1.2), round(1 + next() * 1.4), round(0.8 + next() * 0.7), 'unit']);
  return units;
}

const round = v => Math.round(v * 100) / 100;

/** Distance from a point to the segment a–b, and whether the closest point lies in front of a wall normal. */
function segmentDistance(px, pz, ax, az, bx, bz) {
  const dx = bx - ax; const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  const cx = ax + dx * t; const cz = az + dz * t;
  return { distance: Math.hypot(px - cx, pz - cz), x: cx, z: cz };
}

const STREET_KINDS = ['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service', 'pedestrian', 'living_street'];
const AWNING_COLOURS = ['#2f5d4e', '#7a2e2e', '#24466b', '#9a6b22', '#4b4b4b', '#5b3a6b'];

/**
 * Shop awnings: on shop and retail buildings, the wall segments that face a street within `reach` metres
 * (measured from the wall's middle, in front of it) get a canvas awning, inset from the corners.
 * @returns {Array<{ a: number[]; b: number[]; normal: number[]; colour: string }>}
 */
export function awningSpans(building, roads, reach = 14) {
  const style = facadeStyleFor(building);
  if (!FACADE_STYLES[style].storefront || !(building.shop || ['commercial', 'retail'].includes(building.kind))) return [];
  const streets = roads.filter(r => STREET_KINDS.includes(r.kind));
  const spans = [];
  const ring = building.ring;
  const colour = AWNING_COLOURS[Math.abs(building.id) % AWNING_COLOURS.length];
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i]; const [bx, bz] = ring[(i + 1) % ring.length];
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 4) continue;
    const nx = (bz - az) / length; const nz = -(bx - ax) / length;
    const mx = (ax + bx) / 2; const mz = (az + bz) / 2;
    let facing = false;
    for (const road of streets) {
      for (let k = 0; k + 1 < road.points.length && !facing; k++) {
        const [sx, sz] = road.points[k]; const [ex, ez] = road.points[k + 1];
        const hit = segmentDistance(mx, mz, sx, sz, ex, ez);
        if (hit.distance <= reach + road.width / 2 && (hit.x - mx) * nx + (hit.z - mz) * nz > 1) facing = true;
      }
      if (facing) break;
    }
    if (!facing) continue;
    const inset = Math.min(1, length * 0.12);
    const ux = (bx - ax) / length; const uz = (bz - az) / length;
    spans.push({ a: [round(ax + ux * inset), round(az + uz * inset)], b: [round(bx - ux * inset), round(bz - uz * inset)], normal: [round(nx), round(nz)], colour });
  }
  return spans;
}
