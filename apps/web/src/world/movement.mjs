/** Pure movement and interaction rules shared by desktop and touch inputs. */
export const WORLD_RADIUS = 11.5;
export const SCHOOL_DOOR = Object.freeze({ x: 0, z: -5.5 });
export const SOLID_AREAS = Object.freeze([
  { minX: -3.9, maxX: 3.9, minZ: -11.5, maxZ: -6.75 }, // school
  { minX: -10.5, maxX: -6.3, minZ: -7.5, maxZ: -2.6 }, // homes
  { minX: 6.3, maxX: 10.5, minZ: -7.5, maxZ: -2.6 },
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
  const x = strafe * -forwardZ + advance * forwardX;
  const z = strafe * forwardX + advance * forwardZ;
  const length = Math.hypot(x, z);
  return length ? { x: x / length || 0, z: z / length || 0 } : { x: 0, z: 0 };
}

function blocked(x, z) {
  const radius = 0.38;
  return SOLID_AREAS.some(area =>
    x + radius > area.minX && x - radius < area.maxX &&
    z + radius > area.minZ && z - radius < area.maxZ);
}

export function stepPosition(position, keys, elapsedSeconds, speed = 4, cameraForward = { x: 0, z: -1 }) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0 ||
      !Number.isFinite(speed) || speed <= 0) return { ...position };
  // A suspended tab cannot teleport a character through a building on resume.
  const dt = Math.min(elapsedSeconds, 0.05);
  const vector = movementVector(keys, cameraForward);
  const x = Math.max(-WORLD_RADIUS + 0.4,
    Math.min(WORLD_RADIUS - 0.4, position.x + vector.x * speed * dt));
  const z = Math.max(-WORLD_RADIUS + 0.4,
    Math.min(WORLD_RADIUS - 0.4, position.z + vector.z * speed * dt));
  // Slide along obstacles instead of stopping entirely at corners.
  const nextX = blocked(x, position.z) ? position.x : x;
  const nextZ = blocked(nextX, z) ? position.z : z;
  return { x: nextX, z: nextZ };
}

export function isNearSchool(position) {
  return Math.hypot(position.x - SCHOOL_DOOR.x, position.z - SCHOOL_DOOR.z) <= 2.4;
}
