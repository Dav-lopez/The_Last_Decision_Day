/**
 * The open road (open-world item 17): one drivable road from the north end of Maple Street to downtown, so you can
 * drive there and back without a fade. Downtown sits north of the town (CITY_ORIGIN), and the road continues
 * Maple Street's exit road north, then bends onto the real downtown street that reaches the city's south edge
 * closest to it (Broadway, for Boulder). Pure geometry in world metres (x east, z north), no renderer.
 */
import { CITY_ORIGIN } from './cityLayout.mjs';
import { TOWN_EXIT, footprintPoints, vehicleBlocked } from './vehicleDrive.mjs';

/** Where the Maple end starts (inside the town, so even a long vehicle's tail is on the road) and the straight part ends. */
export const ROAD_START = Object.freeze({ x: 0, z: 4 });
export const ROAD_STRAIGHT_TO = 170;
/** Half the width of the existing exit road (matches TOWN_EXIT). */
export const TOWN_HALF_WIDTH = TOWN_EXIT.halfWidth;
/** How far before the city's edge the road lines up with the downtown street, and how far into the city it runs. */
const APPROACH = 30;
const INTO_CITY = 24;
/** The city counts as entered this far inside its edge, and as left this close to it (a little hysteresis). */
export const CITY_ENTER_MARGIN = 20;
export const CITY_LEAVE_MARGIN = 14;
const DRIVABLE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential']);

/**
 * The downtown street that crosses the city's south driving edge nearest the town (world x = 0).
 * Returns the crossing (local), the unit direction into the city, the street's name and width; null if none.
 */
export function findSouthEntry(city) {
  const [, hz] = city.halfSize;
  const edge = -(hz - CITY_LEAVE_MARGIN);
  let best = null;
  for (const road of city.roads) {
    if (!DRIVABLE.has(road.kind) || !(road.width >= 7)) continue;
    for (let i = 1; i < road.points.length; i++) {
      const [ax, az] = road.points[i - 1];
      const [bx, bz] = road.points[i];
      if ((az - edge) * (bz - edge) >= 0) continue;
      const f = (edge - az) / (bz - az);
      const x = ax + (bx - ax) * f;
      const length = Math.hypot(bx - ax, bz - az);
      // Point the direction into the city (north).
      const sign = bz > az ? 1 : -1;
      const dir = { x: sign * (bx - ax) / length, z: sign * (bz - az) / length };
      const score = Math.abs(CITY_ORIGIN.x + x) - road.width * 4;
      if (!best || score < best.score) best = { score, x, z: edge, dir, name: road.name || 'the main road', width: road.width };
    }
  }
  if (!best) return null;
  const { score: _score, ...entry } = best;
  return entry;
}

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);

/** Builds the road for a city: centreline samples with a half-width each, from Maple Street to just inside downtown. */
export function buildOpenRoad(city) {
  const entry = findSouthEntry(city);
  if (!entry) return null;
  const world = (x, z) => ({ x: CITY_ORIGIN.x + x, z: CITY_ORIGIN.z + z });
  const edgeWorld = world(entry.x, entry.z);
  const lineUp = { x: edgeWorld.x - entry.dir.x * APPROACH, z: edgeWorld.z - entry.dir.z * APPROACH };
  const inside = { x: edgeWorld.x + entry.dir.x * INTO_CITY, z: edgeWorld.z + entry.dir.z * INTO_CITY };
  const halfCity = Math.max(TOWN_HALF_WIDTH, entry.width / 2 + 0.6);
  const points = [];
  const push = (x, z, half) => points.push({ x, z, half });
  for (let z = ROAD_START.z; z < ROAD_STRAIGHT_TO; z += 4) push(ROAD_START.x, z, TOWN_HALF_WIDTH);
  // A cubic bend from the straight onto the downtown street's line, widening as it goes.
  const p0 = { x: ROAD_START.x, z: ROAD_STRAIGHT_TO };
  const reach = Math.hypot(lineUp.x - p0.x, lineUp.z - p0.z) / 3;
  const p1 = { x: p0.x, z: p0.z + reach };
  const p2 = { x: lineUp.x - entry.dir.x * reach, z: lineUp.z - entry.dir.z * reach };
  const bendSteps = 48;
  for (let i = 0; i < bendSteps; i++) {
    const t = i / bendSteps, u = 1 - t;
    const x = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * lineUp.x;
    const z = u * u * u * p0.z + 3 * u * u * t * p1.z + 3 * u * t * t * p2.z + t * t * t * lineUp.z;
    push(x, z, lerp(TOWN_HALF_WIDTH, halfCity, smooth(t)));
  }
  const tail = APPROACH + INTO_CITY;
  for (let s = 0; s <= tail; s += 3) push(lineUp.x + entry.dir.x * s, lineUp.z + entry.dir.z * s, halfCity);
  if (Math.hypot(points.at(-1).x - inside.x, points.at(-1).z - inside.z) > 0.01) push(inside.x, inside.z, halfCity);
  // Cumulative length along the road.
  const along = [0];
  for (let i = 1; i < points.length; i++) along.push(along[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x - p.half); maxX = Math.max(maxX, p.x + p.half);
    minZ = Math.min(minZ, p.z - p.half); maxZ = Math.max(maxZ, p.z + p.half);
  }
  return Object.freeze({
    points: Object.freeze(points.map(p => Object.freeze(p))), along: Object.freeze(along), length: along.at(-1),
    bounds: Object.freeze({ minX, maxX, minZ, maxZ }), entry: Object.freeze({ ...entry, world: edgeWorld }),
    street: entry.name, halfSize: city.halfSize,
  });
}

/** The nearest point on the road: distance from the centreline, the half-width there, metres along and 0–1 progress. */
export function roadProgress(road, point) {
  let best = { distance: Infinity, half: 0, along: 0, t: 0, index: 0 };
  const { points, along } = road;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dz = b.z - a.z;
    const length2 = dx * dx + dz * dz || 1;
    const f = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / length2));
    const distance = Math.hypot(point.x - (a.x + dx * f), point.z - (a.z + dz * f));
    if (distance < best.distance) {
      const metres = along[i - 1] + (along[i] - along[i - 1]) * f;
      best = { distance, half: lerp(a.half, b.half, f), along: metres, t: metres / road.length, index: i };
    }
  }
  return best;
}

/** True when the point is on the road's tarmac. */
export function onOpenRoad(road, point) {
  const { minX, maxX, minZ, maxZ } = road.bounds;
  if (point.x < minX || point.x > maxX || point.z < minZ || point.z > maxZ) return false;
  const near = roadProgress(road, point);
  return near.distance <= near.half;
}

/** A spot on the road `t` of the way along (0 = Maple Street, 1 = downtown), facing towards downtown. */
export function roadPose(road, t) {
  const target = Math.max(0, Math.min(1, t)) * road.length;
  const { points, along } = road;
  let i = 1;
  while (i < points.length - 1 && along[i] < target) i++;
  const a = points[i - 1], b = points[i];
  const f = along[i] === along[i - 1] ? 0 : (target - along[i - 1]) / (along[i] - along[i - 1]);
  return { x: lerp(a.x, b.x, f), z: lerp(a.z, b.z, f), rotation: Math.atan2(b.x - a.x, b.z - a.z) };
}

/** Local downtown coordinates are inside the city's driving area, `margin` metres in from its edge. */
export function insideCity(road, point, margin) {
  const [hx, hz] = road.halfSize;
  const x = point.x - CITY_ORIGIN.x, z = point.z - CITY_ORIGIN.z;
  return Math.abs(x) < hx - margin && Math.abs(z) < hz - margin;
}

/**
 * Collision for a car on Maple Street or out on the road. Near the town the usual street rules apply; once any
 * part of the car is past the exit road's end, every part of it has to be on the road's tarmac.
 */
export function streetOrRoadBlocked(road, car, otherCars = [], people = []) {
  const points = footprintPoints(car);
  if (!road || points.every(point => point.z <= TOWN_EXIT.leaveAt)) return vehicleBlocked(car, otherCars, people);
  return points.some(point => !onOpenRoad(road, point));
}

/**
 * Fog along the road: Maple Street's thick haze near town thinning to downtown's lighter one, so neither place
 * pops into view.
 */
export function roadFog(road, point, streetFog, cityFog) {
  const t = roadProgress(road, point).t;
  return lerp(streetFog, cityFog, smooth(Math.max(0, Math.min(1, (t - 0.25) / 0.65))));
}

/** Dashes down the centreline (pairs of points), skipping the stretch Maple Street's own road already paints. */
export function centreDashes(road, from = ROAD_STRAIGHT_TO, dash = 3, gap = 4.5) {
  const dashes = [];
  const start = roadProgress(road, { x: ROAD_START.x, z: from }).along;
  for (let s = start; s + dash < road.length; s += dash + gap) {
    dashes.push([roadPose(road, s / road.length), roadPose(road, (s + dash) / road.length)]);
  }
  return dashes;
}

/**
 * How far past downtown's driving edge a point (city-local) is, in metres: negative inside, positive beyond.
 * Downtown's edges are its limits (open-world 17e): only the open road leads out.
 */
export function cityEdgeExcess(local, halfSize, margin = CITY_LEAVE_MARGIN) {
  const [hx, hz] = halfSize;
  return Math.max(Math.abs(local[0]) - (hx - margin), Math.abs(local[1]) - (hz - margin));
}

/**
 * A car moving from `before` to `next` (city-local) at downtown's edge: `atEdge` once past it, `hold` when the move
 * would take it further out (the car stops there), so it can always turn or reverse back in, even if it started
 * past the edge.
 */
export function cityEdgeStep(before, next, halfSize, margin = CITY_LEAVE_MARGIN) {
  const was = cityEdgeExcess(before, halfSize, margin);
  const now = cityEdgeExcess(next, halfSize, margin);
  const atEdge = now > 0;
  return { atEdge, hold: atEdge && now > was + 1e-6 };
}

/** Where the GPS points to drive home from downtown: a little way in from the edge on the open road's street (city-local). */
export function roadHomeWaypoint(road, inset = 12) {
  const { x, z, dir } = road.entry;
  return { x: x + dir.x * inset, z: z + dir.z * inset, label: `Road home: ${road.street} south` };
}

/**
 * A drivable street that crosses downtown's east driving edge (city-local): where it crosses, and the unit
 * direction out of the city. The playtest drives out along it to check the edge holds the car.
 */
export function findEastExit(city) {
  const [hx] = city.halfSize;
  const edge = hx - CITY_LEAVE_MARGIN;
  let best = null;
  for (const road of city.roads) {
    if (!DRIVABLE.has(road.kind) || !(road.width >= 7)) continue;
    for (let i = 1; i < road.points.length; i++) {
      const [ax, az] = road.points[i - 1];
      const [bx, bz] = road.points[i];
      if ((ax - edge) * (bx - edge) >= 0) continue;
      const f = (edge - ax) / (bx - ax);
      const length = Math.hypot(bx - ax, bz - az);
      const sign = bx > ax ? 1 : -1;
      const dir = { x: sign * (bx - ax) / length, z: sign * (bz - az) / length };
      // The straightest, widest crossing.
      const score = dir.x * 10 + road.width;
      if (!best || score > best.score) best = { score, x: edge, z: az + (bz - az) * f, dir, name: road.name || 'a side street' };
    }
  }
  if (!best) return null;
  const { score: _score, ...exit } = best;
  return exit;
}
