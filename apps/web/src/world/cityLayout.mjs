/**
 * Real downtowns from OpenStreetMap (© OpenStreetMap contributors, ODbL),
 * placed off-map at CITY_ORIGIN. City files (apps/web/public/city/*.json) hold
 * building rings (counter-clockwise, metres, x east / z north), heights, roads
 * and parks around the box centre. Pure geometry: validation, triangulation,
 * collision and the bus stop where you arrive.
 */
import { HUMAN_RUN_SPEED, HUMAN_WALK_SPEED, classifyHumanMotion } from './humanMotion.mjs';
import { movementVector } from './movement.mjs';

export const CITY_ORIGIN = Object.freeze({ x: 1000, z: 0 });
const PLAYER_RADIUS = 0.38;
const EDGE_MARGIN = 6;
const CELL = 25;

const isPoint = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

/** Keep only well-formed features; returns null if the file isn't a usable city. */
export function readCity(data) {
  if (!data || typeof data !== 'object' || data.license !== 'ODbL-1.0' || !Array.isArray(data.buildings)) return null;
  const half = Array.isArray(data.halfSize) && data.halfSize.every(v => Number.isFinite(v) && v > 20) ? data.halfSize : null;
  if (!half) return null;
  const buildings = data.buildings.filter(b => Array.isArray(b?.ring) && b.ring.length >= 3 && b.ring.every(isPoint) &&
    Number.isFinite(b.height) && b.height > 0 && b.height < 200);
  const roads = (data.roads ?? []).filter(r => Array.isArray(r?.points) && r.points.length >= 2 && r.points.every(isPoint) && Number.isFinite(r.width));
  const parks = (data.parks ?? []).filter(p => Array.isArray(p?.ring) && p.ring.length >= 3 && p.ring.every(isPoint));
  return { id: String(data.id), name: String(data.name), attribution: String(data.attribution), halfSize: half, buildings, roads, parks };
}

export function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    sum += x1 * z2 - x2 * z1;
  }
  return sum / 2;
}

const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function insideTriangle(p, a, b, c) {
  const d1 = cross(a, b, p);
  const d2 = cross(b, c, p);
  const d3 = cross(c, a, p);
  const negative = d1 < 0 || d2 < 0 || d3 < 0;
  const positive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(negative && positive);
}

/**
 * Ear-clipping triangulation of a simple polygon (any winding). Returns index
 * triples into the ring, counter-clockwise. Falls back to a fan if the ring is
 * self-touching (OSM data occasionally is) rather than dropping the roof.
 */
export function triangulate(ring) {
  const n = ring.length;
  if (n < 3) return [];
  const order = ringArea(ring) >= 0 ? [...Array(n).keys()] : [...Array(n).keys()].reverse();
  const triangles = [];
  let guard = 0;
  while (order.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let i = 0; i < order.length; i++) {
      const ia = order[(i + order.length - 1) % order.length];
      const ib = order[i];
      const ic = order[(i + 1) % order.length];
      const a = ring[ia]; const b = ring[ib]; const c = ring[ic];
      if (cross(a, b, c) <= 1e-9) continue; // reflex or degenerate corner
      let ear = true;
      for (const j of order) {
        if (j === ia || j === ib || j === ic) continue;
        if (insideTriangle(ring[j], a, b, c)) { ear = false; break; }
      }
      if (!ear) continue;
      triangles.push([ia, ib, ic]);
      order.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (order.length === 3) triangles.push([order[0], order[1], order[2]]);
  else for (let i = 1; i + 1 < order.length; i++) triangles.push([order[0], order[i], order[i + 1]]);
  return triangles;
}

export function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToRing(x, z, ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const dx = bx - ax; const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
  }
  return best;
}

/** Collision for a city: a coarse grid of building bounds keeps checks cheap. */
export function createCityCollider(city) {
  const grid = new Map();
  const key = (cx, cz) => `${cx},${cz}`;
  city.buildings.forEach((building, index) => {
    const xs = building.ring.map(p => p[0]); const zs = building.ring.map(p => p[1]);
    for (let cx = Math.floor((Math.min(...xs) - 1) / CELL); cx <= Math.floor((Math.max(...xs) + 1) / CELL); cx++) {
      for (let cz = Math.floor((Math.min(...zs) - 1) / CELL); cz <= Math.floor((Math.max(...zs) + 1) / CELL); cz++) {
        const cell = grid.get(key(cx, cz)) ?? [];
        cell.push(index);
        grid.set(key(cx, cz), cell);
      }
    }
  });
  const [hx, hz] = city.halfSize;
  /** Local (city) coordinates. */
  const blockedLocal = (x, z, people = []) => {
    if (Math.abs(x) > hx - EDGE_MARGIN || Math.abs(z) > hz - EDGE_MARGIN) return true;
    if (people.some(person => Math.hypot(x - person.x, z - person.z) < PLAYER_RADIUS + (person.radius ?? 0.3))) return true;
    for (const index of grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      const ring = city.buildings[index].ring;
      if (pointInRing(x, z, ring) || distanceToRing(x, z, ring) < PLAYER_RADIUS) return true;
    }
    return false;
  };
  /** Strictly inside a building (for the camera, which has no body). */
  const insideLocal = (x, z) => (grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? [])
    .some(index => pointInRing(x, z, city.buildings[index].ring));
  return { blockedLocal, insideLocal };
}

export const toWorld = ([x, z]) => ({ x: CITY_ORIGIN.x + x, z: CITY_ORIGIN.z + z });
export const toLocal = ({ x, z }) => [x - CITY_ORIGIN.x, z - CITY_ORIGIN.z];

/**
 * The bus stop: the free point on a main street closest to the city centre.
 * Returns local coordinates plus the street's direction (for facing).
 */
export function findBusStop(city, collider) {
  const preferred = ['primary', 'secondary', 'tertiary', 'pedestrian', 'residential', 'unclassified'];
  let best = null;
  for (const road of city.roads) {
    const rank = preferred.indexOf(road.kind);
    if (rank < 0) continue;
    for (let i = 0; i + 1 < road.points.length; i++) {
      const [ax, az] = road.points[i];
      const [bx, bz] = road.points[i + 1];
      for (let t = 0; t <= 1; t += 0.1) {
        const x = ax + (bx - ax) * t; const z = az + (bz - az) * t;
        if (collider.blockedLocal(x, z)) continue;
        const score = Math.hypot(x, z) + rank * 25;
        // Stand at the kerb, not in the traffic lane: step off to whichever side is free.
        const length = Math.hypot(bx - ax, bz - az) || 1;
        const side = road.width / 2 + 1.2;
        const nx = -(bz - az) / length; const nz = (bx - ax) / length;
        const kerb = [[x + nx * side, z + nz * side, nx, nz], [x - nx * side, z - nz * side, -nx, -nz]].find(([kx, kz]) => !collider.blockedLocal(kx, kz));
        if (!kerb) continue;
        if (!best || score < best.score) best = { x: kerb[0], z: kerb[1], ox: kerb[2], oz: kerb[3], score, dx: (bx - ax) / length, dz: (bz - az) / length, road: road.name || road.kind };
      }
    }
  }
  // heading: the street's direction (unit dx, dz), so the player arrives looking along it;
  // away: unit vector from the road to the kerb, where the sign stands.
  return best && { x: best.x, z: best.z, heading: Math.atan2(best.dx, best.dz), dx: best.dx, dz: best.dz, awayX: best.ox, awayZ: best.oz, street: best.road };
}

/** Dash segments (dash, gap in metres) along a polyline, for painted lane lines. */
export function laneDashes(points, dash = 3, gap = 6) {
  const dashes = [];
  let phase = 0; // metres into the current dash+gap cycle
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    const length = Math.hypot(bx - ax, bz - az);
    let t = 0;
    while (t < length) {
      const inDash = phase < dash;
      const step = Math.min(length - t, inDash ? dash - phase : dash + gap - phase);
      if (inDash && step > 0.05) {
        const s = t / length; const e = (t + step) / length;
        dashes.push([[ax + (bx - ax) * s, az + (bz - az) * s], [ax + (bx - ax) * e, az + (bz - az) * e]]);
      }
      t += step;
      phase = (phase + step) % (dash + gap);
    }
  }
  return dashes;
}

/**
 * How far the follow camera can sit from the player before a building is in
 * the way (world coordinates; 2D, since downtown buildings are taller than the
 * camera). Returns the clear distance, capped at the wanted one.
 */
export function cameraClearance(collider, target, camera) {
  const dx = camera.x - target.x; const dz = camera.z - target.z;
  const wanted = Math.hypot(dx, dz);
  if (!(wanted > 0)) return 0;
  const [tx, tz] = toLocal(target);
  for (let d = 0.5; d < wanted; d += 0.4) {
    if (collider.insideLocal(tx + dx / wanted * d, tz + dz / wanted * d)) return Math.max(0, d - 0.6);
  }
  return wanted;
}

/** Same controls, speeds and clips as on Maple Street. Positions are world coordinates. */
export function stepCityLocomotion(collider, position, keys, seconds, sprintEnabled, cameraForward) {
  const elapsed = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.05)) : 0;
  const running = sprintEnabled || keys.has('Shift');
  const distance = (running ? HUMAN_RUN_SPEED : HUMAN_WALK_SPEED) * elapsed;
  const vector = movementVector(keys, cameraForward);
  const steps = Math.max(1, Math.ceil(distance / 0.15));
  let [x, z] = toLocal(position);
  for (let i = 0; i < steps && distance > 0; i++) {
    const nx = x + vector.x * distance / steps;
    const nz = z + vector.z * distance / steps;
    if (!collider.blockedLocal(nx, z)) x = nx;
    if (!collider.blockedLocal(x, nz)) z = nz;
  }
  const next = toWorld([x, z]);
  const speed = elapsed > 0 ? Math.hypot(next.x - position.x, next.z - position.z) / elapsed : 0;
  return { position: next, speed, moving: speed > 0, motion: classifyHumanMotion(speed) };
}

/** The bus stop on Maple Street (north end of the left sidewalk) and the ride's game time. */
export const MAPLE_BUS_STOP = Object.freeze({ x: -2.55, z: 9.9 });
export const BUS_RIDE_MINUTES = 15;
const STOP_RANGE = 1.5;
export function atBusStop(position, stop) {
  return Boolean(stop) && Number.isFinite(position?.x) && Number.isFinite(position?.z) &&
    Math.hypot(position.x - stop.x, position.z - stop.z) <= STOP_RANGE;
}
