/** Pure movement and interaction rules shared by desktop and touch inputs. */
import { PARKED_CARS, CAR_HALF_WIDTH, CAR_HALF_LENGTH, STREET_LIGHTS } from './streetLayout.mjs';
export const WORLD_RADIUS = 11.5;
export const SCHOOL_DOOR = Object.freeze({ x: 0, z: -5.5 });
export const TREE_TRUNKS = Object.freeze([
  { x: -8, z: 3 }, { x: 8, z: 3 },
  { x: -8, z: 8 }, { x: 8, z: 8 },
  { x: -4.8, z: -8.4 }, { x: 4.8, z: -8.4 },
]);
export const SOLID_AREAS = Object.freeze([
  { minX: -3.9, maxX: 3.9, minZ: -11.5, maxZ: -6.75 }, // school
  { minX: -10.5, maxX: -6.3, minZ: -7.5, maxZ: -2.6 }, // homes
  { minX: 6.3, maxX: 10.5, minZ: -7.5, maxZ: -2.6 },
  ...PARKED_CARS.map(car => ({ minX: car.x - CAR_HALF_WIDTH, maxX: car.x + CAR_HALF_WIDTH,
    minZ: car.z - CAR_HALF_LENGTH, maxZ: car.z + CAR_HALF_LENGTH })),
]);

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

function blocked(x, z) {
  const radius = 0.38;
  const insideBuilding = SOLID_AREAS.some(area =>
    x + radius > area.minX && x - radius < area.maxX &&
    z + radius > area.minZ && z - radius < area.maxZ);
  // Tree trunks are cylinders (diameter 0.42) rather than rectangular walls.
  // A small extra margin prevents the player capsule clipping through bark.
  return insideBuilding || TREE_TRUNKS.some(tree =>
    Math.hypot(x - tree.x, z - tree.z) < radius + 0.21 + 0.04) ||
    STREET_LIGHTS.some(light => Math.hypot(x - light.x, z - light.z) < radius + 0.1);
}

export function stepPosition(position, keys, elapsedSeconds, speed = 4, cameraForward = { x: 0, z: -1 }) {
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
    const nextX = blocked(x, next.z) ? next.x : x;
    const nextZ = blocked(nextX, z) ? next.z : z;
    next = { x: nextX, z: nextZ };
  }
  return next;
}

export function isNearSchool(position) {
  // The interaction belongs to the front doorway, not the school side walls.
  return Math.abs(position.x - SCHOOL_DOOR.x) <= 1.45 &&
    Math.abs(position.z - SCHOOL_DOOR.z) <= 1.6;
}
