/** Pure movement and interaction rules shared by desktop and touch inputs. */
export const WORLD_RADIUS = 11.5;
export const SCHOOL_DOOR = Object.freeze({ x: 0, z: -5.5 });
export const SOLID_AREAS = Object.freeze([
  { minX: -3.9, maxX: 3.9, minZ: -11.5, maxZ: -6.75 }, // school
  { minX: -10.5, maxX: -6.3, minZ: -7.5, maxZ: -2.6 }, // homes
  { minX: 6.3, maxX: 10.5, minZ: -7.5, maxZ: -2.6 },
]);

export function movementVector(keys) {
  const x = Number(keys.has('d') || keys.has('ArrowRight')) -
    Number(keys.has('a') || keys.has('ArrowLeft'));
  const z = Number(keys.has('s') || keys.has('ArrowDown')) -
    Number(keys.has('w') || keys.has('ArrowUp'));
  const length = Math.hypot(x, z);
  return length ? { x: x / length, z: z / length } : { x: 0, z: 0 };
}

function blocked(x, z) {
  const radius = 0.38;
  return SOLID_AREAS.some(area =>
    x + radius > area.minX && x - radius < area.maxX &&
    z + radius > area.minZ && z - radius < area.maxZ);
}

export function stepPosition(position, keys, elapsedSeconds, speed = 4) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0 ||
      !Number.isFinite(speed) || speed <= 0) return { ...position };
  // A suspended tab cannot teleport a character through a building on resume.
  const dt = Math.min(elapsedSeconds, 0.05);
  const vector = movementVector(keys);
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
