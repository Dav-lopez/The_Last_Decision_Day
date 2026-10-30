/**
 * Neighbourhood residents: who is out, where they walk and when they give way.
 * Pure and deterministic; the scene advances each person's own walking time.
 * Routes are straight segments walked back and forth (sidewalks, a crosswalk);
 * standing people idle in place. Minutes are game minutes since midnight.
 */
import { carContains, isBlocked, WORLD_RADIUS } from './movement.mjs';
import { STREET_HALF_WIDTH } from './suburbLayout.mjs';
import { STREET_LIGHTS } from './streetLayout.mjs';
import { SCHOOL_ORIGIN, TEACHER_STANDS } from './schoolInterior.mjs';

export const PERSON_RADIUS = 0.3;
/** Walkers keep right so two people meeting on a sidewalk pass instead of both stopping. */
export const KEEP_RIGHT = 0.12;
const LOOK_AHEAD = 0.4;
const POLE_CLEARANCE = 0.42;
const SWERVE_LENGTH = 0.9;

/** Ease sideways around lamp posts standing in the walking line, then back into lane. */
function swerveAroundPoles(x, z, ux, uz) {
  for (const light of STREET_LIGHTS) {
    const rx = x - light.x;
    const rz = z - light.z;
    const along = rx * ux + rz * uz;
    if (Math.abs(along) >= SWERVE_LENGTH) continue;
    const side = rx * uz - rz * ux;            // signed distance from the pole across the route
    if (Math.abs(side) >= POLE_CLEARANCE) continue;
    const ease = 0.5 + 0.5 * Math.cos(Math.PI * along / SWERVE_LENGTH);
    const away = Math.sign(side) || 1;
    const push = (POLE_CLEARANCE - Math.abs(side)) * ease * away;
    x += uz * push;
    z -= ux * push;
  }
  return { x, z };
}
const YIELD_DISTANCE = 1.1;
const YIELD_HALF_WIDTH = 0.65;
/** The middle of each sidewalk (2.18–2.83 m from the centre line), clear of the parked cars. */
const SIDEWALK_X = 2.45;

const H = hours => hours * 60;
const person = (id, look, route, speed, startOffset, from, until) =>
  Object.freeze({ id, look: Object.freeze(look), route: Object.freeze(route), speed, startOffset, from, until });
const segment = (ax, az, bx, bz) => ({ kind: 'segment', a: Object.freeze({ x: ax, z: az }), b: Object.freeze({ x: bx, z: bz }) });
const stand = (x, z, facing) => ({ kind: 'stand', at: Object.freeze({ x, z }), facing });

export const NEIGHBORS = Object.freeze([
  person('jogger-west', { body: 'female', skin: 'light', hair: 'blonde', hairStyle: 'buns', top: 'tank', outfit: 'red', bottom: 'leggings', bottomColor: 'black', shoes: 'sneakers', shoeColor: 'white' }, segment(-SIDEWALK_X, 10.4, -SIDEWALK_X, -5.3), 1.35, 0, H(6.5), H(21)),
  person('walker-east', { skin: 'deep', hair: 'black', hairStyle: 'buzzed', facialHair: 'beard', top: 'hoodie', outfit: 'green', bottom: 'jeans', bottomColor: 'denim', shoes: 'hightops', shoeColor: 'black' }, segment(SIDEWALK_X, -5.3, SIDEWALK_X, 10.4), 1.1, 6, H(7), H(21)),
  person('commuter-west', { body: 'female', skin: 'olive', hair: 'brown', hairStyle: 'long', top: 'longsleeve', outfit: 'gold', bottom: 'trousers', bottomColor: 'charcoal', shoes: 'flats', shoeColor: 'black' }, segment(-SIDEWALK_X, 10.4, -SIDEWALK_X, -5.3), 1.25, 11, H(7.5), H(20)),
  person('neighbor-east', { skin: 'warm', hair: 'gray', hairStyle: 'parted', top: 'tshirt', outfit: 'blue', bottom: 'shorts', bottomColor: 'tan', shoes: 'sandals', shoeColor: 'brown' }, segment(SIDEWALK_X, -5.3, SIDEWALK_X, 10.4), 1.2, 15, H(8), H(19)),
  person('crosser', { body: 'female', skin: 'deep', hair: 'black', hairStyle: 'pixie', top: 'tshirt', outfit: 'white', bottom: 'skirt', bottomColor: 'red', shoes: 'boots', shoeColor: 'brown' }, segment(-SIDEWALK_X, 5.5, SIDEWALK_X, 5.5), 1.15, 2, H(7), H(20)),
  // Two classmates chat on the school lawn during school hours, facing each other.
  person('student-a', { body: 'female', skin: 'porcelain', hair: 'auburn', hairStyle: 'long', top: 'hoodie', outfit: 'purple', bottom: 'jeans', bottomColor: 'denim', shoes: 'sneakers', shoeColor: 'white' }, stand(-2.3, -5.05, Math.atan2(-0.5, -0.45)), 0, 0, H(7.5), H(16)),
  person('student-b', { skin: 'brown', hair: 'dark', hairStyle: 'parted', top: 'tshirt', outfit: 'gold', bottom: 'jeans', bottomColor: 'navy', shoes: 'hightops', shoeColor: 'red' }, stand(-1.8, -4.6, Math.atan2(0.5, 0.45)), 0, 0, H(7.5), H(16)),
  // Inside the classroom (see schoolInterior): the teacher at the board and two classmates by the windows.
  person('teacher', { body: 'female', skin: 'olive', hair: 'dark', hairStyle: 'buns', top: 'longsleeve', outfit: 'navy', bottom: 'skirt', bottomColor: 'charcoal', shoes: 'dress', shoeColor: 'black' }, stand(TEACHER_STANDS.x, TEACHER_STANDS.z, Math.PI), 0, 0, H(7.5), H(16)),
  person('classmate-a', { skin: 'deep', hair: 'black', hairStyle: 'buzzed', top: 'longsleeve', outfit: 'red', bottom: 'trousers', bottomColor: 'black', shoes: 'sneakers', shoeColor: 'black' }, stand(SCHOOL_ORIGIN.x + 4.1, SCHOOL_ORIGIN.z - 2.5, Math.atan2(0.6, 0.5)), 0, 0, H(7.75), H(15.5)),
  person('classmate-b', { body: 'female', skin: 'light', hair: 'platinum', hairStyle: 'pixie', top: 'crop', outfit: 'sky', bottom: 'jeans', bottomColor: 'denim', shoes: 'sneakers', shoeColor: 'pink' }, stand(SCHOOL_ORIGIN.x + 3.5, SCHOOL_ORIGIN.z - 3.0, Math.atan2(-0.6, -0.5)), 0, 0, H(7.75), H(15.5)),
]);

export function isOut(npc, minute) {
  return Number.isFinite(minute) && minute >= npc.from && minute < npc.until;
}

/**
 * Position and walking direction after `walked` metres along the route,
 * turning around at each end. Standing people never move.
 */
export function routePose(npc, walked) {
  const route = npc.route;
  // personHeading(dx, dz) === facing for this direction.
  if (route.kind === 'stand') return { x: route.at.x, z: route.at.z, dx: -Math.sin(route.facing), dz: -Math.cos(route.facing), moving: false };
  const length = Math.hypot(route.b.x - route.a.x, route.b.z - route.a.z);
  const ux = (route.b.x - route.a.x) / length;
  const uz = (route.b.z - route.a.z) / length;
  const d = (((Number.isFinite(walked) ? walked : 0) + npc.startOffset) % (2 * length) + 2 * length) % (2 * length);
  const outbound = d <= length;
  const along = outbound ? d : 2 * length - d;
  const dx = outbound ? ux : -ux;
  const dz = outbound ? uz : -uz;
  // Facing (dx, dz), the walker's right-hand side is (dz, -dx) in Babylon's left-handed world.
  const laned = swerveAroundPoles(route.a.x + ux * along + dz * KEEP_RIGHT, route.a.z + uz * along - dx * KEEP_RIGHT, ux, uz);
  return {
    x: laned.x,
    z: laned.z,
    dx,
    dz,
    moving: true,
  };
}

/** True when the walker's next step would enter a car's footprint (parked, moved or being driven). */
export function carAhead(npc, walked, cars) {
  if (npc.route.kind !== 'segment') return false;
  const next = routePose(npc, walked + LOOK_AHEAD);
  return cars.some(car => carContains(car, next.x, next.z, PERSON_RADIUS));
}

/** Cars slower than this are treated as standing still. */
const MOVING = 0.25;
/** How far ahead (seconds) a walker judges a moving car's path. */
const CAR_LOOK_SECONDS = 2.2;
const CAR_SAMPLE = 0.2;
/** Extra room a walker leaves between themselves and a passing car. */
const CAR_MARGIN = 0.35;
const KERB_LOOK = 0.6;
export const DODGE_DISTANCE = 1.05;

/** True on the carriageway itself (not the sidewalk). */
export function inRoad(point) {
  return Math.abs(point.x) < STREET_HALF_WIDTH && Math.abs(point.z) < WORLD_RADIUS;
}

/** Where a moving car will be after `seconds`, if it keeps going straight. */
function projectCar(car, seconds) {
  const travel = (car.speed ?? 0) * seconds;
  return { x: car.x + Math.sin(car.rotation) * travel, z: car.z + Math.cos(car.rotation) * travel, rotation: car.rotation };
}

/** True when a moving car will sweep over (x, z) within `horizon` seconds. */
export function inCarPath(x, z, cars, horizon = CAR_LOOK_SECONDS, margin = CAR_MARGIN) {
  for (const car of cars) {
    if (!(Math.abs(car.speed ?? 0) > MOVING)) continue;
    for (let t = 0; t <= horizon + 1e-9; t += CAR_SAMPLE) {
      if (carContains(projectCar(car, t), x, z, PERSON_RADIUS + margin)) return true;
    }
  }
  return false;
}

/**
 * Give way to traffic: a walker waits at the kerb (or on the sidewalk, as a car
 * pulls out of a driveway) instead of stepping into a moving car's path. Someone
 * already out on the road keeps going, so nobody freezes in front of a car.
 */
export function carComing(npc, walked, cars) {
  if (npc.route.kind !== 'segment') return false;
  const here = routePose(npc, walked);
  if (inRoad(here)) return false;
  const next = routePose(npc, walked + KERB_LOOK);
  // Stepping into the road: leave a generous gap. Staying on the sidewalk:
  // only a car actually coming across it (out of a driveway) is a reason to stop.
  return inCarPath(next.x, next.z, cars, CAR_LOOK_SECONDS, inRoad(next) ? CAR_MARGIN : 0);
}

/** Crossing pace: hurry across while a moving car is near, otherwise stroll. */
export function crossingPace(pose, cars) {
  if (!inRoad(pose)) return 1;
  return cars.some(car => Math.abs(car.speed ?? 0) > MOVING && Math.hypot(car.x - pose.x, car.z - pose.z) < 12) ? 1.7 : 1;
}

/**
 * Jump clear: when a moving car is about to reach someone (within a second),
 * the sideways offset that takes them out of its path, away from the car's
 * centre line, on whichever side is free. Null when there's nothing to dodge
 * or nowhere to go.
 */
export function dodgeFrom(pose, cars) {
  for (const car of cars) {
    if (!(Math.abs(car.speed ?? 0) > MOVING)) continue;
    let hit = false;
    for (let t = 0; t <= 1 + 1e-9 && !hit; t += CAR_SAMPLE) hit = carContains(projectCar(car, t), pose.x, pose.z, PERSON_RADIUS + 0.1);
    if (!hit) continue;
    // The car's right-hand side is (cos r, -sin r); step out on our side of its centre line.
    const rx = Math.cos(car.rotation), rz = -Math.sin(car.rotation);
    const side = (pose.x - car.x) * rx + (pose.z - car.z) * rz;
    const first = side >= 0 ? 1 : -1;
    for (const sign of [first, -first]) {
      const offset = { x: rx * sign * DODGE_DISTANCE, z: rz * sign * DODGE_DISTANCE };
      const to = { x: pose.x + offset.x, z: pose.z + offset.z };
      if (!isBlocked(to.x, to.z, []) && !inCarPath(to.x, to.z, [car], 1, 0.05)) return offset;
    }
    return null;
  }
  return null;
}

/**
 * Walkers give way: true when something (the player, a car's footprint
 * sample, another person) is just ahead of them within their path.
 */
export function shouldYield(pose, obstacles) {
  for (const obstacle of obstacles) {
    const rx = obstacle.x - pose.x;
    const rz = obstacle.z - pose.z;
    const ahead = rx * pose.dx + rz * pose.dz;
    const side = Math.abs(rx * pose.dz - rz * pose.dx);
    if (ahead > 0.05 && ahead < YIELD_DISTANCE + (obstacle.radius ?? 0) && side < YIELD_HALF_WIDTH + (obstacle.radius ?? 0)) return true;
  }
  return false;
}

/** Babylon heading for a walking direction; the visual faces -Z at rotation 0. */
export function personHeading(dx, dz) {
  return Math.atan2(-dx, -dz);
}
