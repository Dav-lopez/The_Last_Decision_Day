/**
 * The classroom, built away from the street at SCHOOL_ORIGIN (local +Z points
 * from the chalkboard toward the door, where the camera starts).
 * Pure data and movement; no renderer dependency.
 */
import { movementVector } from './movement.mjs';
import { HUMAN_RUN_SPEED, HUMAN_WALK_SPEED, classifyHumanMotion } from './humanMotion.mjs';
import { propBlocker } from './propLayout.mjs';

export const SCHOOL_ORIGIN = Object.freeze({ x: 0, z: -60 });
export const CLASSROOM = Object.freeze({ halfWidth: 5, halfDepth: 4, wallHeight: 3.1, wallThickness: 0.2 });
export const CLASSROOM_DOOR_HALF_WIDTH = 0.65;
const PLAYER_RADIUS = 0.38;
const REACH = 1.0;

const local = (x, z) => ({ x: SCHOOL_ORIGIN.x + x, z: SCHOOL_ORIGIN.z + z });
const site = (id, type, x, z, rotation) => Object.freeze({ id, type, ...local(x, z), rotation });

const COLUMNS = [-3, -1, 1, 3];
const ROWS = [-0.5, 1.4];
const CHAIR_BEHIND = 0.6;

/** Student desks in two rows of four, each with a chair facing the board. */
export const CLASS_DESKS = Object.freeze(ROWS.flatMap((z, row) => COLUMNS.map((x, column) => Object.freeze({
  id: `desk-${row}-${column}`,
  desk: site(`class-desk-${row}-${column}`, 'desk', x, z, 0),
  chair: site(`class-chair-${row}-${column}`, 'dining_chair', x, z + CHAIR_BEHIND, Math.PI),
}))));
export const TEACHER_DESK = site('class-teacher-desk', 'teacher_desk', -1.6, -2.7, 0);
export const CLASSROOM_FURNITURE = Object.freeze([
  TEACHER_DESK, ...CLASS_DESKS.flatMap(entry => [entry.desk, entry.chair]),
]);
const DOOR_LEAF = Object.freeze({
  id: 'classroom-door-leaf', minX: SCHOOL_ORIGIN.x - CLASSROOM_DOOR_HALF_WIDTH, maxX: SCHOOL_ORIGIN.x - CLASSROOM_DOOR_HALF_WIDTH + 0.08,
  minZ: SCHOOL_ORIGIN.z + CLASSROOM.halfDepth + CLASSROOM.wallThickness / 2 - 1.2, maxZ: SCHOOL_ORIGIN.z + CLASSROOM.halfDepth,
});
export const CLASSROOM_BLOCKERS = Object.freeze([...CLASSROOM_FURNITURE.map(propBlocker), DOOR_LEAF]);

export const CLASSROOM_SPAWN = Object.freeze({ ...local(0, 3.2), rotation: 0 });
export const CLASSROOM_EXIT = Object.freeze(local(0, CLASSROOM.halfDepth - 0.4));
/** Stand in front of the teacher's desk to talk to the teacher. */
export const TEACHER_SPOT = Object.freeze(local(-1.6, -1.6));
/** Where the teacher stands: between their desk and the board, facing the class. */
export const TEACHER_STANDS = Object.freeze(local(-1.6, -3.45));
/** Chalkboard on the back wall (local x centre and width), for the scene. */
export const CHALKBOARD = Object.freeze({ x: 1.2, width: 3.6, height: 1.3, y: 1.65 });

export function isInsideClassroom(position) {
  return Math.abs(position.x - SCHOOL_ORIGIN.x) <= CLASSROOM.halfWidth + 1 &&
    Math.abs(position.z - SCHOOL_ORIGIN.z) <= CLASSROOM.halfDepth + 1;
}

export function classroomBlocked(x, z, people = []) {
  const lx = x - SCHOOL_ORIGIN.x;
  const lz = z - SCHOOL_ORIGIN.z;
  if (Math.abs(lx) > CLASSROOM.halfWidth - PLAYER_RADIUS || Math.abs(lz) > CLASSROOM.halfDepth - PLAYER_RADIUS) return true;
  if (people.some(person => Math.hypot(x - person.x, z - person.z) < PLAYER_RADIUS + (person.radius ?? 0.3))) return true;
  return CLASSROOM_BLOCKERS.some(area => x + PLAYER_RADIUS > area.minX && x - PLAYER_RADIUS < area.maxX &&
    z + PLAYER_RADIUS > area.minZ && z - PLAYER_RADIUS < area.maxZ);
}

/** Same controls, speeds and clips as outside. */
export function stepClassroomLocomotion(position, keys, seconds, sprintEnabled, cameraForward, people = []) {
  const elapsed = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.05)) : 0;
  const running = sprintEnabled || keys.has('Shift');
  const distance = (running ? HUMAN_RUN_SPEED : HUMAN_WALK_SPEED) * elapsed;
  const vector = movementVector(keys, cameraForward);
  const steps = Math.max(1, Math.ceil(distance / 0.15));
  let next = { x: position.x, z: position.z };
  for (let i = 0; i < steps && distance > 0; i++) {
    const x = next.x + vector.x * distance / steps;
    const z = next.z + vector.z * distance / steps;
    const nextX = classroomBlocked(x, next.z, people) ? next.x : x;
    const nextZ = classroomBlocked(nextX, z, people) ? next.z : z;
    next = { x: nextX, z: nextZ };
  }
  const speed = elapsed > 0 ? Math.hypot(next.x - position.x, next.z - position.z) / elapsed : 0;
  return { position: next, speed, moving: speed > 0, motion: classifyHumanMotion(speed) };
}

const within = (position, spot, range) => Number.isFinite(position?.x) && Number.isFinite(position?.z) &&
  Math.hypot(position.x - spot.x, position.z - spot.z) <= range;

export function atClassroomExit(position) { return within(position, CLASSROOM_EXIT, 1.25); }
export function nearTeacher(position) { return within(position, TEACHER_SPOT, REACH); }

/** The desk whose chair is closest within reach, or null. */
export function deskInReach(position) {
  let best = null;
  let bestDistance = REACH;
  for (const entry of CLASS_DESKS) {
    const distance = Math.hypot(position.x - entry.chair.x, position.z - entry.chair.z);
    if (Number.isFinite(distance) && distance <= bestDistance) { best = entry; bestDistance = distance; }
  }
  return best;
}
