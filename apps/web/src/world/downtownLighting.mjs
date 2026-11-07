// Baked ambient light for downtown (open-world 20b): no light maps, no probes — the shading is worked
// out once from the street data when downtown is built and carried on vertex colours and two cheap
// overlay meshes, so it costs nothing per frame.
//
// - Walls darken towards the pavement (ground contact) and where a neighbour across an alley or a
//   narrow street hides the sky (street-canyon occlusion, from the neighbour's real height).
// - Soft contact shadows lie on the pavement along every building's foot and under shop awnings.
// - After dark, each street lamp throws a warm pool of light on the ground beneath it.
import { pointInRing } from './cityLayout.mjs';

export const AMBIENT = Object.freeze({
  /** Shade at the very foot of a wall, and the height where ground contact has faded out. */
  foot: 0.6,
  footBand: 2.6,
  /** Shade at the top of the foot band, rising to 1 by `liftBand`. */
  footTop: 0.88,
  liftBand: 12,
  /** How much a fully hidden sky (a neighbour straight overhead) darkens a wall. */
  canyon: 0.42,
  /** How far across the street a wall looks for a neighbour, and the step. */
  reach: 34,
  step: 1.5,
  /** Contact shadow strip: width on the pavement and darkness at the wall. */
  contactWidth: 1.6,
  contactAlpha: 0.5,
  /** Lamp pools: radius on the ground and strength (where real lamp lights exist / where they don't). */
  poolRadius: 6.5,
  poolLit: 0.22,
  poolUnlit: 0.55,
});

const clamp01 = value => Math.min(1, Math.max(0, value));

/** Ground-contact shade at height `y` up a wall: darker at the foot, fading out by `liftBand`. */
export function contactShade(y) {
  const { foot, footBand, footTop, liftBand } = AMBIENT;
  if (y <= 0) return foot;
  if (y < footBand) return foot + (footTop - foot) * (y / footBand);
  if (y < liftBand) return footTop + (1 - footTop) * ((y - footBand) / (liftBand - footBand));
  return 1;
}

/**
 * Where a wall of this height should carry vertices so the shading can bend: the foot, the top of the
 * foot band, the lift height, the neighbour's roof line (where the sky opens) and the top.
 */
export function wallBreaks(height, neighbourHeight = 0) {
  const breaks = [0, AMBIENT.footBand, AMBIENT.liftBand, neighbourHeight, height]
    .filter(y => y >= 0 && y <= height);
  return [...new Set(breaks.map(y => Math.round(y * 1000) / 1000))].sort((a, b) => a - b)
    .filter((y, i, all) => i === 0 || y - all[i - 1] > 0.25 || y === height);
}

/**
 * Sky occlusion at height `y` on a wall whose nearest neighbour in front is `distance` metres away
 * and `neighbourHeight` tall: the elevation angle of the neighbour's roof line, as a share of a
 * quarter turn (0 = open sky, 1 = sky fully hidden).
 */
export function canyonOcclusion(y, distance, neighbourHeight) {
  if (!Number.isFinite(distance) || distance <= 0 || neighbourHeight <= y) return 0;
  return Math.atan2(neighbourHeight - y, distance) / (Math.PI / 2);
}

/** Combined ambient shade (0..1, multiplied into a wall's colour) at height `y`. */
export function wallShade(y, distance = Infinity, neighbourHeight = 0) {
  return contactShade(y) * (1 - AMBIENT.canyon * canyonOcclusion(y, distance, neighbourHeight));
}

/** A coarse grid over the building footprints, so each wall only tests the buildings near it. */
export function buildingIndex(buildings, cell = 24) {
  const grid = new Map();
  const key = (i, j) => `${i},${j}`;
  buildings.forEach((building, index) => {
    const xs = building.ring.map(p => p[0]); const zs = building.ring.map(p => p[1]);
    const box = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
    for (let i = Math.floor(box[0] / cell); i <= Math.floor(box[2] / cell); i++) {
      for (let j = Math.floor(box[1] / cell); j <= Math.floor(box[3] / cell); j++) {
        const k = key(i, j);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push({ index, box });
      }
    }
  });
  /** The building (other than `skip`) whose footprint holds this point, or -1. */
  const at = (x, z, skip = -1) => {
    for (const { index, box } of grid.get(key(Math.floor(x / cell), Math.floor(z / cell))) ?? []) {
      if (index === skip || x < box[0] || x > box[2] || z < box[1] || z > box[3]) continue;
      if (pointInRing(x, z, buildings[index].ring)) return index;
    }
    return -1;
  };
  return { at };
}

/**
 * The nearest other building straight out from the middle of a wall (city-local metres): how far, and
 * how tall. `{ distance: Infinity, height: 0 }` when the wall faces open street or a park.
 */
export function facingNeighbour(buildings, index, self, a, b, normal) {
  const mx = (a[0] + b[0]) / 2; const mz = (a[1] + b[1]) / 2;
  for (let d = AMBIENT.step; d <= AMBIENT.reach; d += AMBIENT.step) {
    const hit = index.at(mx + normal[0] * d, mz + normal[1] * d, self);
    if (hit >= 0) return { distance: d, height: buildings[hit].height };
  }
  return { distance: Infinity, height: 0 };
}

/** Outward unit normal of a counter-clockwise ring's edge a→b (x east, z north), or null for a sliver. */
export function edgeNormal(a, b) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (length < 0.05) return null;
  return [(b[1] - a[1]) / length, -(b[0] - a[0]) / length];
}

/**
 * Contact-shadow quads on the ground along a footprint: each is four corners [x, z] (wall-left,
 * wall-right, outer-right, outer-left) with v = 0 at the wall and 1 at the outer edge. Edges whose
 * strip would lie inside a neighbouring building are skipped.
 */
export function contactStrips(ring, isInsideOther = () => false, width = AMBIENT.contactWidth) {
  const strips = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]; const b = ring[(i + 1) % ring.length];
    const n = edgeNormal(a, b);
    if (!n) continue;
    const mid = [(a[0] + b[0]) / 2 + n[0] * width * 0.5, (a[1] + b[1]) / 2 + n[1] * width * 0.5];
    if (isInsideOther(mid[0], mid[1])) continue;
    strips.push([a, b, [b[0] + n[0] * width, b[1] + n[1] * width], [a[0] + n[0] * width, a[1] + n[1] * width]]);
  }
  return strips;
}

/** The shade on the pavement under an awning (same corner order; v from `near` to `far`). */
export function awningShadow(span, reach = 1.25) {
  const [nx, nz] = span.normal;
  const out = reach * 1.1;
  return [span.a, span.b, [span.b[0] + nx * out, span.b[1] + nz * out], [span.a[0] + nx * out, span.a[1] + nz * out]];
}

/** Opacity of the contact shadow at v (0 at the wall, 1 at the outer edge): a soft quadratic falloff. */
export function contactFalloff(v) {
  const t = 1 - clamp01(v);
  return t * t;
}

/**
 * A pool of lamp light on the ground under each lamp head (city-local; the head hangs 1 m out over the
 * road from the pole). Strength depends on whether real lamp lights also exist on this device.
 */
export function lampPools(spots, clustered) {
  const strength = clustered ? AMBIENT.poolLit : AMBIENT.poolUnlit;
  return spots.map(spot => ({
    x: spot.x + Math.sin(spot.facing) * 1.0,
    z: spot.z + Math.cos(spot.facing) * 1.0,
    radius: AMBIENT.poolRadius,
    strength,
  }));
}

/** Brightness of a lamp pool at distance `r` from its centre (0..1): bright core, long soft edge. */
export function poolFalloff(r, radius = AMBIENT.poolRadius) {
  const t = clamp01(1 - r / radius);
  return t * t * (3 - 2 * t);
}
