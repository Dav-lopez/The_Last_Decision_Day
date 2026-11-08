/**
 * Traffic on the open road between Maple Street and downtown (item 17b).
 *
 * A handful of cars drive the road both ways, each in its right-hand lane, at
 * open-road speeds. They follow the car ahead at a safe gap and brake for you
 * (on foot or in your car) in their lane. They only appear or disappear at the
 * two ends of the stretch — just past Maple Street's barrier and just short of
 * downtown, where the city's own traffic takes over — and only when you're far
 * enough away not to see it; otherwise they wait there, like a car at a junction.
 *
 * Pure and seeded: the scene renders `roadTrafficPoses`. World coordinates
 * (the open road is built in world space).
 */
import { makeRandom } from './cityTraffic.mjs';

export const ROAD_TRAFFIC = Object.freeze({
  count: 6, minCruise: 16.5, maxCruise: 20.5, accel: 2.8, brake: 7.5, carLength: 4.4, gap: 6,
  lookAhead: 45, playerRadius: 1.3, laneFraction: 0.5,
  /** The stretch cars use: from this far past the start (beyond the town barrier) to this far short of the end. */
  townMargin: 95, cityMargin: 60,
  /** Cars only appear or vanish when you're at least this far away, or after waiting this long at the end. */
  hiddenBeyond: 60, maxWait: 8,
});

/** Point and direction `along` metres from the town end, plus the road's half-width there. */
export function roadPoint(road, along) {
  const target = Math.max(0, Math.min(road.length, along));
  const { points } = road;
  let i = 1;
  while (i < points.length - 1 && road.along[i] < target) i++;
  const a = points[i - 1], b = points[i];
  const span = road.along[i] - road.along[i - 1] || 1;
  const f = (target - road.along[i - 1]) / span;
  const dx = (b.x - a.x) / span, dz = (b.z - a.z) / span;
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, dx, dz, half: a.half + (b.half - a.half) * f };
}

/** The stretch the road traffic uses, in metres along the road. */
export function trafficStretch(road) {
  const from = Math.min(road.length, ROAD_TRAFFIC.townMargin);
  const to = Math.max(from, road.length - ROAD_TRAFFIC.cityMargin);
  return { from, to };
}

/** Where a car is and which way it faces: dir +1 drives towards downtown, −1 towards town; right-hand lane. */
export function roadCarPose(road, car) {
  const p = roadPoint(road, car.along);
  const dx = p.dx * car.dir, dz = p.dz * car.dir;
  const lane = p.half * ROAD_TRAFFIC.laneFraction;
  // Facing (dx, dz), the right-hand side is (dz, −dx).
  return { x: p.x + dz * lane, z: p.z - dx * lane, rotation: Math.atan2(dx, dz), dx, dz };
}

/** `count` cars spread along the stretch, alternating directions. */
export function createRoadTraffic(road, count = ROAD_TRAFFIC.count, seed = 17) {
  const random = makeRandom(seed);
  const { from, to } = trafficStretch(road);
  const cars = [];
  for (let i = 0; i < count; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    const slot = (i >> 1) / Math.max(1, Math.ceil(count / 2));
    const along = from + (to - from) * ((slot + random() * 0.25) % 1);
    cars.push({ id: i, paint: (i * 7 + 3) % 6, dir, along, speed: 0, cruise: ROAD_TRAFFIC.minCruise + random() * (ROAD_TRAFFIC.maxCruise - ROAD_TRAFFIC.minCruise), parked: false });
  }
  return { cars, random };
}

/** Distance to the nearest thing in this car's lane ahead (another road car, you, your car), or Infinity. */
export function laneGap(road, car, cars, obstacles = []) {
  const pose = roadCarPose(road, car);
  let best = Infinity;
  const consider = (x, z, radius) => {
    const rx = x - pose.x, rz = z - pose.z;
    const ahead = rx * pose.dx + rz * pose.dz;
    const side = Math.abs(rx * pose.dz - rz * pose.dx);
    if (ahead > 0 && ahead < ROAD_TRAFFIC.lookAhead && side < 1.25 + radius) best = Math.min(best, ahead - radius);
  };
  for (const other of cars) {
    if (other === car || other.dir !== car.dir || other.parked) continue;
    const o = roadCarPose(road, other);
    consider(o.x, o.z, ROAD_TRAFFIC.carLength / 2);
  }
  for (const o of obstacles) consider(o.x, o.z, o.radius ?? ROAD_TRAFFIC.playerRadius);
  return best;
}

/**
 * Advance the road traffic. `obstacles` are world points to stop for; `viewers` are where the player is
 * (cars only swap ends when every viewer is at least `hiddenBeyond` away from both the old and new spot).
 */
export function stepRoadTraffic(road, traffic, seconds, obstacles = [], viewers = []) {
  const dt = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.1)) : 0;
  if (!dt) return traffic;
  const { from, to } = trafficStretch(road);
  const hidden = point => viewers.every(v => Math.hypot(v.x - point.x, v.z - point.z) >= ROAD_TRAFFIC.hiddenBeyond);
  const cars = traffic.cars.map(car => {
    const end = car.dir > 0 ? to : from;
    const left = (end - car.along) * car.dir;
    if (left <= 0) {
      // At the end of the stretch: reappear at the start of its own direction, once nobody can see it happen.
      const start = car.dir > 0 ? from : to;
      const waited = (car.waited ?? 0) + dt;
      if (waited >= ROAD_TRAFFIC.maxWait || (hidden(roadCarPose(road, car)) && hidden(roadCarPose(road, { ...car, along: start })))) {
        return { ...car, along: start, speed: car.cruise * 0.8, waited: 0 };
      }
      return { ...car, along: end, speed: 0, waited };
    }
    let target = car.cruise;
    const gap = laneGap(road, car, traffic.cars, obstacles) - ROAD_TRAFFIC.carLength / 2 - ROAD_TRAFFIC.gap;
    if (gap < 0) target = 0;
    else if (gap < 30) target = Math.min(target, Math.sqrt(2 * ROAD_TRAFFIC.brake * 0.6 * gap));
    // Ease off towards the end of the stretch (a junction ahead).
    if (left < 25) target = Math.min(target, 4 + left * 0.5);
    const speed = car.speed < target ? Math.min(target, car.speed + ROAD_TRAFFIC.accel * dt) : Math.max(target, car.speed - ROAD_TRAFFIC.brake * dt);
    const along = car.along + speed * dt * car.dir;
    return { ...car, speed, along: car.dir > 0 ? Math.min(along, end) : Math.max(along, end) };
  });
  return { ...traffic, cars };
}

/** Render data and collision footprints (world): pose, paint and speed for every car. */
export function roadTrafficPoses(road, traffic) {
  return traffic.cars.map(car => ({ id: car.id, paint: car.paint, speed: car.speed, ...roadCarPose(road, car) }));
}
