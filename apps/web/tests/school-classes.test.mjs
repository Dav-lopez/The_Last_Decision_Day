import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHOOL_CLOSES, SCHOOL_OPENS, TIMETABLE, attendLesson, currentEntry, isSchoolOpen, joinableLesson, nextLesson, schoolStatus,
} from '../src/world/schoolSchedule.mjs';
import {
  CLASSROOM, CLASSROOM_BLOCKERS, CLASSROOM_DOOR_HALF_WIDTH, CLASSROOM_EXIT, CLASSROOM_FURNITURE, CLASSROOM_SPAWN, CLASS_DESKS,
  SCHOOL_ORIGIN, TEACHER_SPOT, TEACHER_STANDS, atClassroomExit, classroomBlocked, deskInReach, isInsideClassroom, nearTeacher,
  stepClassroomLocomotion,
} from '../src/world/schoolInterior.mjs';
import { HOME_ORIGIN } from '../src/world/homeInterior.mjs';
import { PROP_TYPES } from '../src/world/propLayout.mjs';
import { WORLD_RADIUS } from '../src/world/movement.mjs';

const H = (h, m = 0) => h * 60 + m;
const overlaps = (a, b) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
const walk = (from, keys, seconds) => {
  let position = from;
  for (let t = 0; t < seconds; t += 0.05) position = stepClassroomLocomotion(position, new Set(keys), 0.05, false, { x: 0, z: -1 }).position;
  return position;
};

test('the school day runs 7:30 AM to 4 PM with four lessons and lunch, in order', () => {
  assert.equal(isSchoolOpen(H(7, 29)), false);
  assert.equal(isSchoolOpen(SCHOOL_OPENS), true);
  assert.equal(isSchoolOpen(SCHOOL_CLOSES), false);
  assert.equal(isSchoolOpen(Number.NaN), false);
  assert.deepEqual(TIMETABLE.filter(e => e.kind === 'class').map(e => e.title), ['Math', 'Science', 'History', 'Art']);
  for (let i = 1; i < TIMETABLE.length; i++) assert.ok(TIMETABLE[i].start >= TIMETABLE[i - 1].end, 'no overlaps');
  for (const entry of TIMETABLE) assert.ok(entry.start >= SCHOOL_OPENS && entry.end <= SCHOOL_CLOSES);
  assert.equal(currentEntry(H(11, 30))?.id, 'lunch');
  assert.equal(nextLesson(H(9, 31))?.id, 'science');
  assert.equal(nextLesson(H(15, 30)), null);
});

test('you can join from 5 minutes early until 15 minutes late', () => {
  assert.equal(joinableLesson(H(7, 54)), null);
  assert.equal(joinableLesson(H(7, 55))?.id, 'math');
  assert.equal(joinableLesson(H(8, 15))?.id, 'math');
  assert.equal(joinableLesson(H(8, 16)), null, 'too late for Math');
  assert.equal(joinableLesson(H(11, 30)), null, 'no lesson at lunch');
  assert.equal(joinableLesson(H(12, 0))?.id, 'history');
});

test('taking a class skips to its end and costs seated energy', () => {
  const result = attendLesson({ day: 2, minute: H(8, 5), energy: 80 });
  assert.equal(result.lesson.id, 'math');
  assert.equal(result.life.day, 2);
  assert.equal(result.life.minute, H(9, 30));
  const minutes = H(9, 30) - H(8, 5);
  assert.ok(Math.abs(result.life.energy - (80 - minutes * (100 / 960) * 0.6)) < 1e-9);
  assert.ok(result.life.energy > 80 - minutes * (100 / 960), 'cheaper than walking about');
  assert.equal(attendLesson({ day: 2, minute: H(10, 30), energy: 80 }), null, 'Science started too long ago');
  assert.equal(attendLesson({ day: 2, minute: H(8, 0), energy: 0.5 }).life.energy, 0, 'energy never negative');
});

test('the chalkboard tells you what is on', () => {
  assert.match(schoolStatus(H(6)), /closed · opens 7:30 AM/);
  assert.match(schoolStatus(H(7, 40)), /Next: Math at 8:00 AM/);
  assert.match(schoolStatus(H(8, 2)), /Math · 8:00 AM–9:30 AM · take a seat/);
  assert.match(schoolStatus(H(9)), /Math in progress until 9:30 AM/);
  assert.match(schoolStatus(H(11, 30)), /Lunch until 12:00 PM · next: History/);
  assert.match(schoolStatus(H(15, 30)), /Lessons are over for today/);
});

test('the classroom is off-map, apart from the home, with every desk inside and nothing overlapping', () => {
  assert.ok(Math.abs(SCHOOL_ORIGIN.z) - CLASSROOM.halfDepth - 12 > WORLD_RADIUS);
  assert.ok(Math.hypot(SCHOOL_ORIGIN.x - HOME_ORIGIN.x, SCHOOL_ORIGIN.z - HOME_ORIGIN.z) > 40);
  assert.equal(isInsideClassroom(CLASSROOM_SPAWN), true);
  assert.equal(isInsideClassroom({ x: 0, z: 0 }), false);
  for (const site of CLASSROOM_FURNITURE) assert.ok(site.type in PROP_TYPES, `${site.type} has sizes`);
  assert.equal(CLASS_DESKS.length, 8);
  for (const blocker of CLASSROOM_BLOCKERS) {
    assert.ok(blocker.minX >= SCHOOL_ORIGIN.x - CLASSROOM.halfWidth && blocker.maxX <= SCHOOL_ORIGIN.x + CLASSROOM.halfWidth, blocker.id);
    assert.ok(blocker.minZ >= SCHOOL_ORIGIN.z - CLASSROOM.halfDepth && blocker.maxZ <= SCHOOL_ORIGIN.z + CLASSROOM.halfDepth, blocker.id);
    for (const other of CLASSROOM_BLOCKERS) if (other !== blocker) assert.ok(!overlaps(blocker, other), `${blocker.id} overlaps ${other.id}`);
  }
  const doorway = { minX: SCHOOL_ORIGIN.x - CLASSROOM_DOOR_HALF_WIDTH + 0.08, maxX: SCHOOL_ORIGIN.x + CLASSROOM_DOOR_HALF_WIDTH, minZ: SCHOOL_ORIGIN.z + 2.6, maxZ: SCHOOL_ORIGIN.z + CLASSROOM.halfDepth };
  for (const blocker of CLASSROOM_BLOCKERS) assert.ok(!overlaps(blocker, doorway), `${blocker.id} blocks the doorway`);
});

test('from the door you can reach a desk, the teacher and back out; walls and desks are solid', () => {
  assert.equal(classroomBlocked(CLASSROOM_SPAWN.x, CLASSROOM_SPAWN.z), false);
  assert.ok(atClassroomExit(CLASSROOM_SPAWN));
  // Down the centre aisle toward the board.
  const front = walk(CLASSROOM_SPAWN, ['w'], 3);
  assert.ok(front.z < SCHOOL_ORIGIN.z - 1, `reached the front at ${JSON.stringify(front)}`);
  assert.ok(deskInReach({ x: SCHOOL_ORIGIN.x, z: SCHOOL_ORIGIN.z + 0.1 }), 'a chair is in reach from the centre aisle');
  // Across the front to the teacher (D walks toward -X with the camera looking down -Z).
  const atTeacher = walk({ x: SCHOOL_ORIGIN.x, z: TEACHER_SPOT.z }, ['d'], 0.9);
  assert.ok(nearTeacher(atTeacher), `reached the teacher spot at ${JSON.stringify(atTeacher)}`);
  assert.equal(classroomBlocked(TEACHER_SPOT.x, TEACHER_SPOT.z), false);
  assert.equal(nearTeacher(CLASSROOM_SPAWN), false);
  for (const entry of CLASS_DESKS) assert.equal(classroomBlocked(entry.desk.x, entry.desk.z), true);
  for (const keys of [['w'], ['s'], ['a'], ['d']]) {
    const end = walk({ x: SCHOOL_ORIGIN.x, z: SCHOOL_ORIGIN.z + 3 }, keys, 6);
    assert.ok(Math.abs(end.x - SCHOOL_ORIGIN.x) < CLASSROOM.halfWidth && Math.abs(end.z - SCHOOL_ORIGIN.z) < CLASSROOM.halfDepth);
  }
  // The teacher stands behind their desk, inside the room and not inside furniture.
  assert.ok(Math.abs(TEACHER_STANDS.z - SCHOOL_ORIGIN.z) < CLASSROOM.halfDepth - 0.3);
  assert.equal(classroomBlocked(TEACHER_STANDS.x, TEACHER_STANDS.z, []) && CLASSROOM_BLOCKERS.some(b =>
    TEACHER_STANDS.x > b.minX && TEACHER_STANDS.x < b.maxX && TEACHER_STANDS.z > b.minZ && TEACHER_STANDS.z < b.maxZ), false);
  assert.ok(Math.hypot(CLASSROOM_EXIT.x - CLASSROOM_SPAWN.x, CLASSROOM_EXIT.z - CLASSROOM_SPAWN.z) < 1.25);
});

test('people in the classroom are solid too', () => {
  const person = { x: CLASSROOM_SPAWN.x, z: CLASSROOM_SPAWN.z - 1, radius: 0.3 };
  const end = stepClassroomLocomotion(CLASSROOM_SPAWN, new Set(['w']), 0.05, false, { x: 0, z: -1 }, [person]);
  let position = end.position;
  for (let i = 0; i < 40; i++) position = stepClassroomLocomotion(position, new Set(['w']), 0.05, false, { x: 0, z: -1 }, [person]).position;
  assert.ok(position.z >= person.z + 0.68 - 1e-6);
});
