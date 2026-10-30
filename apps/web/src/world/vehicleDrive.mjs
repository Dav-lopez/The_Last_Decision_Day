/**
 * Renderer-independent driving rules for the neighborhood sedans.
 * Units are metres, seconds and radians. A car's Babylon Y rotation r points
 * its front (local +Z) along (sin r, cos r); positive steering turns right.
 */
import { STATIC_SOLIDS, TREE_TRUNKS, WORLD_RADIUS, carContains, isBlocked } from './movement.mjs';
import { CAR_HALF_LENGTH, CAR_HALF_WIDTH, STREET_LIGHTS } from './streetLayout.mjs';

export const VEHICLE = Object.freeze({
  maxForwardSpeed: 9,      // ~32 km/h: a residential street, not a race track
  maxReverseSpeed: 3.2,
  acceleration: 5.5,
  reverseAcceleration: 3.5,
  brakeDeceleration: 11,
  coastDeceleration: 1.8,
  wheelbase: 2.6,
  maxSteerAngle: 0.78,     // tight enough to turn round on a residential street
  parkedSpeed: 0.4,        // at or below this the driver may get out
  exitClearance: 0.62,
});

const SAMPLE_X = [-1, 0, 1];
const SAMPLE_Z = [-1, -0.5, 0, 0.5, 1];

export function vehicleForward(rotation) {
  return { x: Math.sin(rotation), z: Math.cos(rotation) };
}

/** Local car coordinates (right, forward) to world X/Z. */
export function carLocalToWorld(car, localX, localZ) {
  const cos = Math.cos(car.rotation);
  const sin = Math.sin(car.rotation);
  return { x: car.x + localX * cos + localZ * sin, z: car.z - localX * sin + localZ * cos };
}

/** Keyboard and touch pad share one key set: W/S throttle and brake, A/D steer. */
export function driveInput(keys) {
  const has = (...names) => names.some(name => keys.has(name));
  return {
    throttle: Number(has('w', 'ArrowUp')) - Number(has('s', 'ArrowDown')),
    steer: Number(has('d', 'ArrowRight')) - Number(has('a', 'ArrowLeft')),
  };
}

export function footprintPoints(car) {
  const points = [];
  for (const fx of SAMPLE_X) for (const fz of SAMPLE_Z) {
    points.push(carLocalToWorld(car, fx * CAR_HALF_WIDTH, fz * CAR_HALF_LENGTH));
  }
  return points;
}

/**
 * The north end of Maple Street opens onto the road out of town: past the
 * fence line, cars may drive on along the road (and only the road).
 */
export const TOWN_EXIT = Object.freeze({ halfWidth: 2.6, beyond: WORLD_RADIUS - 0.2, leaveAt: 19, gateRange: 9 });
export function onExitRoad(point) {
  return point.z > TOWN_EXIT.beyond && point.z < TOWN_EXIT.leaveAt + 6 && Math.abs(point.x) < TOWN_EXIT.halfWidth;
}
/** True once the driven car is far enough up the exit road to leave town. */
export function leavingTown(car) {
  return car.z >= TOWN_EXIT.leaveAt && Math.abs(car.x) < TOWN_EXIT.halfWidth + 1;
}

/** True when the car's footprint would overlap the world edge, a building, tree, lamp post or another car. */
export function vehicleBlocked(car, otherCars = [], people = []) {
  const limit = WORLD_RADIUS - 0.2;
  const points = footprintPoints(car);
  for (const point of points) {
    if ((Math.abs(point.x) > limit || Math.abs(point.z) > limit) && !onExitRoad(point)) return true;
    if (STATIC_SOLIDS.some(area => point.x > area.minX && point.x < area.maxX && point.z > area.minZ && point.z < area.maxZ)) return true;
    if (TREE_TRUNKS.some(tree => Math.hypot(point.x - tree.x, point.z - tree.z) < 0.3)) return true;
    if (STREET_LIGHTS.some(light => Math.hypot(point.x - light.x, point.z - light.z) < 0.15)) return true;
    if (otherCars.some(other => carContains(other, point.x, point.z))) return true;
    if (people.some(person => Math.hypot(point.x - person.x, point.z - person.z) < (person.radius ?? 0.3))) return true;
  }
  // Catch a corner of another car poking into this car's side.
  return otherCars.some(other => footprintPoints(other).some(point => carContains(car, point.x, point.z)));
}

function nextSpeed(speed, throttle, seconds) {
  const v = VEHICLE;
  let next = speed;
  if (throttle > 0) {
    next = speed < -0.05 ? Math.min(0, speed + v.brakeDeceleration * seconds) : speed + v.acceleration * seconds;
  } else if (throttle < 0) {
    next = speed > 0.05 ? Math.max(0, speed - v.brakeDeceleration * seconds) : speed - v.reverseAcceleration * seconds;
  } else {
    const drop = v.coastDeceleration * seconds;
    next = Math.abs(speed) <= drop ? 0 : speed - Math.sign(speed) * drop;
  }
  return Math.max(-v.maxReverseSpeed, Math.min(v.maxForwardSpeed, next));
}

/**
 * Advance one frame with a kinematic bicycle model. Movement is swept in short
 * steps; on contact the car stops at its last free position instead of tunneling.
 */
export function stepVehicle(car, input, seconds, otherCars = [], people = [], blocked = vehicleBlocked) {
  if (!Number.isFinite(seconds) || seconds <= 0) return { ...car, collided: false };
  const dt = Math.min(seconds, 0.05);
  const throttle = Math.max(-1, Math.min(1, Number(input?.throttle) || 0));
  const steer = Math.max(-1, Math.min(1, Number(input?.steer) || 0));
  const speed = nextSpeed(car.speed ?? 0, throttle, dt);
  const yawRate = speed * Math.tan(steer * VEHICLE.maxSteerAngle) / VEHICLE.wheelbase;
  const steps = Math.max(1, Math.ceil(Math.abs(speed) * dt / 0.1));
  const slice = dt / steps;
  let state = { x: car.x, z: car.z, rotation: car.rotation, speed };
  for (let i = 0; i < steps; i++) {
    const rotation = state.rotation + yawRate * slice;
    const forward = vehicleForward(rotation);
    const candidate = { x: state.x + forward.x * speed * slice, z: state.z + forward.z * speed * slice, rotation, speed };
    if (blocked(candidate, otherCars, people)) return { ...state, speed: 0, collided: true };
    state = candidate;
  }
  return { ...state, collided: false };
}

export function canExitVehicle(car) {
  return Math.abs(car.speed ?? 0) <= VEHICLE.parkedSpeed;
}

/**
 * Where the driver stands after getting out: driver side (car's left) first,
 * then passenger side, behind and in front. Null when every door is blocked.
 */
export function vehicleExitPosition(car, allCars, isFree = null) {
  const side = CAR_HALF_WIDTH + VEHICLE.exitClearance;
  const end = CAR_HALF_LENGTH + VEHICLE.exitClearance;
  const candidates = [[-side, 0.2], [side, 0.2], [0, -end], [0, end]];
  for (const [localX, localZ] of candidates) {
    const point = carLocalToWorld(car, localX, localZ);
    if (isFree) { if (isFree(point)) return point; continue; }
    const inside = Math.abs(point.x) < WORLD_RADIUS - 0.4 && Math.abs(point.z) < WORLD_RADIUS - 0.4;
    if (inside && !isBlocked(point.x, point.z, allCars)) return point;
  }
  return null;
}

/** ArcRotateCamera alpha that places the camera directly behind the car. */
export function chaseCameraAlpha(rotation) {
  return Math.atan2(-Math.cos(rotation), -Math.sin(rotation));
}

export function speedKmh(speed) {
  return Math.round(Math.abs(speed ?? 0) * 3.6);
}
