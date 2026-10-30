/**
 * The player's home: front-door rules on the street and a furnished studio
 * (living area + bedroom) built away from the street at HOME_ORIGIN.
 * Pure data and movement; no renderer dependency.
 *
 * Interior coordinates are local to HOME_ORIGIN; +Z points from the back wall
 * toward the front door, where the camera starts. Furniture rotation 0 faces +Z.
 */
import { movementVector } from './movement.mjs';
import { HUMAN_RUN_SPEED, HUMAN_WALK_SPEED, classifyHumanMotion } from './humanMotion.mjs';
import { HOUSE_SITES } from './suburbLayout.mjs';
import { propBlocker } from './propLayout.mjs';

export const HOME_ORIGIN = Object.freeze({ x: 0, z: 60 });
export const ROOM = Object.freeze({ halfWidth: 4.6, halfDepth: 3.6, wallHeight: 2.9, wallThickness: 0.2 });
export const DOOR_HALF_WIDTH = 0.65;
const PLAYER_RADIUS = 0.38;
const DOOR_RANGE = 1.25;
const ENTRY_OFFSET = 0.85;
const STREET_DOOR_Z = -2.2;

/** Street-side front doors. House 0 is the player's; the neighbour's is locked. */
export const FRONT_DOORS = Object.freeze(HOUSE_SITES.map((site, index) => Object.freeze({
  id: `house-${index}`, own: index === 0,
  x: site.x + site.roadSide * ENTRY_OFFSET, z: STREET_DOOR_Z,
})));

const local = (x, z) => ({ x: HOME_ORIGIN.x + x, z: HOME_ORIGIN.z + z });
const furniture = (id, type, x, z, rotation) => Object.freeze({ id, type, ...local(x, z), rotation });

export const HOME_FURNITURE = Object.freeze([
  furniture('home-sofa', 'sofa', -3.95, 0.2, Math.PI / 2),
  furniture('home-coffee-table', 'coffee_table', -2.6, 0.2, Math.PI / 2),
  furniture('home-armchair', 'armchair', -1.5, 0.2, -Math.PI / 2),
  furniture('home-floor-lamp', 'floor_lamp', -4.2, -2.0, 0),
  furniture('home-shelf', 'shelf', -2.4, -3.35, 0),
  furniture('home-bed', 'bed', 3.3, -2.35, 0),
  furniture('home-desk-chair', 'dining_chair', 1.6, -3.1, 0),
]);
/** The open front-door leaf stands inside the room at the doorway's left edge. */
export const DOOR_LEAF = Object.freeze({
  id: 'home-door-leaf', minX: HOME_ORIGIN.x - DOOR_HALF_WIDTH, maxX: HOME_ORIGIN.x - DOOR_HALF_WIDTH + 0.08,
  minZ: HOME_ORIGIN.z + ROOM.halfDepth + ROOM.wallThickness / 2 - 1.2, maxZ: HOME_ORIGIN.z + ROOM.halfDepth,
});
export const HOME_BLOCKERS = Object.freeze([...HOME_FURNITURE.map(propBlocker), DOOR_LEAF]);

/** Where the player appears after entering, and the inside of the front door. */
export const HOME_SPAWN = Object.freeze({ ...local(0, 2.7), rotation: 0 });
export const HOME_EXIT_DOOR = Object.freeze(local(0, ROOM.halfDepth - 0.4));
/** Where a bed will be used from (the sleep feature builds on this). */
export const BED_SIDE = Object.freeze(local(3.3, -0.65));

export function streetDoorAt(position) {
  if (!Number.isFinite(position?.x) || !Number.isFinite(position?.z)) return null;
  return FRONT_DOORS.find(door => Math.hypot(position.x - door.x, position.z - door.z) <= DOOR_RANGE) ?? null;
}

export function atHomeExit(position) {
  return Number.isFinite(position?.x) && Number.isFinite(position?.z) &&
    Math.hypot(position.x - HOME_EXIT_DOOR.x, position.z - HOME_EXIT_DOOR.z) <= DOOR_RANGE;
}

/** Leaving puts the player on the porch, facing the street. */
export function streetSpawnFor(door) {
  return { x: door.x, z: door.z + 0.55, rotation: Math.PI };
}

export function isInsideHome(position) {
  return Math.abs(position.x - HOME_ORIGIN.x) <= ROOM.halfWidth + 1 &&
    Math.abs(position.z - HOME_ORIGIN.z) <= ROOM.halfDepth + 1;
}

export function homeBlocked(x, z) {
  const lx = x - HOME_ORIGIN.x;
  const lz = z - HOME_ORIGIN.z;
  // The doorway is closed for walking: leaving is an explicit E action.
  if (Math.abs(lx) > ROOM.halfWidth - PLAYER_RADIUS || Math.abs(lz) > ROOM.halfDepth - PLAYER_RADIUS) return true;
  return HOME_BLOCKERS.some(area => x + PLAYER_RADIUS > area.minX && x - PLAYER_RADIUS < area.maxX &&
    z + PLAYER_RADIUS > area.minZ && z - PLAYER_RADIUS < area.maxZ);
}

/** Indoor counterpart of stepLocomotion: same controls, speeds and clip selection. */
export function stepHomeLocomotion(position, keys, seconds, sprintEnabled, cameraForward) {
  const elapsed = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.05)) : 0;
  const running = sprintEnabled || keys.has('Shift');
  const distance = (running ? HUMAN_RUN_SPEED : HUMAN_WALK_SPEED) * elapsed;
  const vector = movementVector(keys, cameraForward);
  const steps = Math.max(1, Math.ceil(distance / 0.15));
  let next = { x: position.x, z: position.z };
  for (let i = 0; i < steps && distance > 0; i++) {
    const x = next.x + vector.x * distance / steps;
    const z = next.z + vector.z * distance / steps;
    const nextX = homeBlocked(x, next.z) ? next.x : x;
    const nextZ = homeBlocked(nextX, z) ? next.z : z;
    next = { x: nextX, z: nextZ };
  }
  const speed = elapsed > 0 ? Math.hypot(next.x - position.x, next.z - position.z) / elapsed : 0;
  return { position: next, speed, moving: speed > 0, motion: classifyHumanMotion(speed) };
}

/**
 * Cutaway walls: a wall fades when the camera is on its outer side, so the
 * player is never hidden. Returns the wall ids to fade for a camera position.
 */
export const HOME_WALLS = Object.freeze([
  Object.freeze({ id: 'back', normal: Object.freeze({ x: 0, z: -1 }) }),
  Object.freeze({ id: 'front', normal: Object.freeze({ x: 0, z: 1 }) }),
  Object.freeze({ id: 'left', normal: Object.freeze({ x: -1, z: 0 }) }),
  Object.freeze({ id: 'right', normal: Object.freeze({ x: 1, z: 0 }) }),
]);
/** Walls of any room (origin + half sizes) that stand between the camera and the room. */
export function wallsToFadeFor(origin, room, cameraPosition) {
  const dx = cameraPosition.x - origin.x;
  const dz = cameraPosition.z - origin.z;
  return HOME_WALLS.filter(wall => {
    const limit = wall.normal.x !== 0 ? room.halfWidth : room.halfDepth;
    return dx * wall.normal.x + dz * wall.normal.z > limit - 0.5;
  }).map(wall => wall.id);
}

export function wallsToFade(cameraPosition) {
  return wallsToFadeFor(HOME_ORIGIN, ROOM, cameraPosition);
}
