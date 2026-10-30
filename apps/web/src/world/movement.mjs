/** Pure movement and interaction rules shared by desktop and touch inputs. */
import { PARKED_CARS, CAR_HALF_WIDTH, CAR_HALF_LENGTH, STREET_LIGHTS } from './streetLayout.mjs';
import { PROP_BLOCKERS } from './propLayout.mjs';
export const WORLD_RADIUS = 11.5;
export const SCHOOL_DOOR = Object.freeze({ x: 0, z: -5.5 });
export const TREE_TRUNKS = Object.freeze([
  { x: -8, z: 3 }, { x: 8, z: 3 },
  { x: -8, z: 8 }, { x: 8, z: 8 },
  { x: -4.8, z: -8.4 }, { x: 4.8, z: -8.4 },
]);
export const BUILDING_AREAS = Object.freeze([
  { minX: -3.9, maxX: 3.9, minZ: -11.5, maxZ: -6.75 }, // school
  { minX: -10.5, maxX: -6.3, minZ: -7.5, maxZ: -2.6 }, // homes
  { minX: 6.3, maxX: 10.5, minZ: -7.5, maxZ: -2.6 },
]);
/** Buildings and street props: everything solid that never moves. */
export const STATIC_SOLIDS = Object.freeze([...BUILDING_AREAS, ...PROP_BLOCKERS]);
/** Buildings plus the cars at their original parking spots (kept for existing callers). */
export const SOLID_AREAS = Object.freeze([
  ...BUILDING_AREAS,
  ...PARKED_CARS.map(car => ({ minX: car.x - CAR_HALF_WIDTH, maxX: car.x + CAR_HALF_WIDTH,
    minZ: car.z - CAR_HALF_LENGTH, maxZ: car.z + CAR_HALF_LENGTH })),
]);

/**
 * True when (x, z) lies inside a car's oriented footprint grown by `margin`.
 * A Babylon Y rotation r maps the car's local +Z (its front) to (sin r, cos r).
 */
export function carContains(car, x, z, margin = 0) {
  const dx = x - car.x;
  const dz = z - car.z;
  const cos = Math.cos(car.rotation ?? 0);
  const sin = Math.sin(car.rotation ?? 0);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return Math.abs(localX) < CAR_HALF_WIDTH + margin && Math.abs(localZ) < CAR_HALF_LENGTH + margin;
}

/**
 * Map directional input onto the camera's horizontal heading.
 * A forward heading of (0, -1) preserves the original world-axis controls.
 * Degenerate headings (for example, a camera looking straight down) fall back
 * to north instead of producing NaN or freezing movement.
 */
export function movementVector(keys, cameraForward = { x: 0, z: -1 }) {
  const strafe = Number(keys.has('d') || keys.has('ArrowRight')) -
    Number(keys.has('a') || keys.has('ArrowLeft'));
  const advance = Number(keys.has('w') || keys.has('ArrowUp')) -
    Number(keys.has('s') || keys.has('ArrowDown'));
  const headingLength = Math.hypot(cameraForward.x, cameraForward.z);
  const validHeading = Number.isFinite(headingLength) && headingLength > 0.000001;
  const forwardX = validHeading ? cameraForward.x / headingLength : 0;
  const forwardZ = validHeading ? cameraForward.z / headingLength : -1;
  // The ArcRotateCamera view's screen-right axis is (forwardZ, -forwardX).
  // Keep the on-screen arrows aligned with the visible character movement.
  const x = strafe * forwardZ + advance * forwardX;
  const z = strafe * -forwardX + advance * forwardZ;
  const length = Math.hypot(x, z);
  return length ? { x: x / length || 0, z: z / length || 0 } : { x: 0, z: 0 };
}

/** Pedestrian collision against buildings, trees, lamp posts and cars wherever they are now. */
export function isBlocked(x, z, cars = PARKED_CARS, people = []) {
  const radius = 0.38;
  if (cars.some(car => carContains(car, x, z, radius))) return true;
  // Neighbours (see npcLayout) are circles; they also step aside for the player.
  if (people.some(person => Math.hypot(x - person.x, z - person.z) < radius + (person.radius ?? 0.3))) return true;
  const insideBuilding = STATIC_SOLIDS.some(area =>
    x + radius > area.minX && x - radius < area.maxX &&
    z + radius > area.minZ && z - radius < area.maxZ);
  // Tree trunks are cylinders (diameter 0.42) rather than rectangular walls.
  // A small extra margin prevents the player capsule clipping through bark.
  return insideBuilding || TREE_TRUNKS.some(tree =>
    Math.hypot(x - tree.x, z - tree.z) < radius + 0.21 + 0.04) ||
    STREET_LIGHTS.some(light => Math.hypot(x - light.x, z - light.z) < radius + 0.1);
}

export function stepPosition(position, keys, elapsedSeconds, speed = 4, cameraForward = { x: 0, z: -1 }, cars = PARKED_CARS, people = []) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0 ||
      !Number.isFinite(speed) || speed <= 0) return { ...position };
  // Cap catch-up movement and sweep in short increments to avoid tunneling
  // through tree trunks or building corners during a slow frame.
  const distance = Math.min(speed * Math.min(elapsedSeconds, 0.05), 1.2);
  const vector = movementVector(keys, cameraForward);
  const steps = Math.max(1, Math.ceil(distance / 0.15));
  const stride = distance / steps;
  let next = { ...position };
  for (let i = 0; i < steps; i++) {
    const x = Math.max(-WORLD_RADIUS + 0.4,
      Math.min(WORLD_RADIUS - 0.4, next.x + vector.x * stride));
    const z = Math.max(-WORLD_RADIUS + 0.4,
      Math.min(WORLD_RADIUS - 0.4, next.z + vector.z * stride));
    // Resolve each axis separately so the avatar slides along obstacles.
    const nextX = isBlocked(x, next.z, cars, people) ? next.x : x;
    const nextZ = isBlocked(nextX, z, cars, people) ? next.z : z;
    next = { x: nextX, z: nextZ };
  }
  return next;
}

export function isNearSchool(position) {
  // The interaction belongs to the front doorway, not the school side walls.
  return Math.abs(position.x - SCHOOL_DOOR.x) <= 1.45 &&
    Math.abs(position.z - SCHOOL_DOOR.z) <= 1.6;
}
