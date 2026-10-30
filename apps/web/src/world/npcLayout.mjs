/**
 * Neighbourhood residents: who is out, where they walk and when they give way.
 * Pure and deterministic; the scene advances each person's own walking time.
 * Routes are straight segments walked back and forth (sidewalks, a crosswalk);
 * standing people idle in place. Minutes are game minutes since midnight.
 */
import { carContains } from './movement.mjs';
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
  person('jogger-west', { skin: 'light', hair: 'blonde', outfit: 'red' }, segment(-SIDEWALK_X, 10.4, -SIDEWALK_X, -5.3), 1.35, 0, H(6.5), H(21)),
  person('walker-east', { skin: 'deep', hair: 'dark', outfit: 'green' }, segment(SIDEWALK_X, -5.3, SIDEWALK_X, 10.4), 1.1, 6, H(7), H(21)),
  person('commuter-west', { skin: 'olive', hair: 'brown', outfit: 'gold' }, segment(-SIDEWALK_X, 10.4, -SIDEWALK_X, -5.3), 1.25, 11, H(7.5), H(20)),
  person('neighbor-east', { skin: 'warm', hair: 'brown', outfit: 'blue' }, segment(SIDEWALK_X, -5.3, SIDEWALK_X, 10.4), 1.2, 15, H(8), H(19)),
  person('crosser', { skin: 'deep', hair: 'dark', outfit: 'red' }, segment(-SIDEWALK_X, 5.5, SIDEWALK_X, 5.5), 1.15, 2, H(7), H(20)),
  // Two classmates chat on the school lawn during school hours, facing each other.
  person('student-a', { skin: 'light', hair: 'brown', outfit: 'green' }, stand(-2.3, -5.05, Math.atan2(-0.5, -0.45)), 0, 0, H(7.5), H(16)),
  person('student-b', { skin: 'warm', hair: 'blonde', outfit: 'gold' }, stand(-1.8, -4.6, Math.atan2(0.5, 0.45)), 0, 0, H(7.5), H(16)),
  // Inside the classroom (see schoolInterior): the teacher at the board and two classmates by the windows.
  person('teacher', { skin: 'olive', hair: 'dark', outfit: 'blue' }, stand(TEACHER_STANDS.x, TEACHER_STANDS.z, Math.PI), 0, 0, H(7.5), H(16)),
  person('classmate-a', { skin: 'deep', hair: 'dark', outfit: 'red' }, stand(SCHOOL_ORIGIN.x + 4.1, SCHOOL_ORIGIN.z - 2.5, Math.atan2(0.6, 0.5)), 0, 0, H(7.75), H(15.5)),
  person('classmate-b', { skin: 'light', hair: 'blonde', outfit: 'green' }, stand(SCHOOL_ORIGIN.x + 3.5, SCHOOL_ORIGIN.z - 3.0, Math.atan2(-0.6, -0.5)), 0, 0, H(7.75), H(15.5)),
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
