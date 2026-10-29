import test from 'node:test';
import assert from 'node:assert/strict';
import { movementVector, stepPosition, isNearSchool, WORLD_RADIUS } from '../src/world/movement.mjs';

test('keyboard and on-screen directional controls use the same normalized movement', () => {
  assert.deepEqual(movementVector(new Set(['w'])), { x: 0, z: -1 });
  assert.deepEqual(movementVector(new Set(['ArrowRight'])), { x: 1, z: 0 });
  const diagonal = movementVector(new Set(['w', 'd']));
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - 1) < 0.00001);
  assert.deepEqual(movementVector(new Set()), { x: 0, z: 0 });
});

test('movement clamps elapsed time, rejecting invalid deltas and speed', () => {
  assert.deepEqual(stepPosition({ x: 0, z: 0 }, new Set(['w']), 0), { x: 0, z: 0 });
  assert.deepEqual(stepPosition({ x: 0, z: 0 }, new Set(['w']), Number.NaN), { x: 0, z: 0 });
  assert.deepEqual(stepPosition({ x: 0, z: 0 }, new Set(['w']), 1), { x: 0, z: -0.2 });
  assert.deepEqual(stepPosition({ x: 0, z: 0 }, new Set(['w']), 0.05, -1), { x: 0, z: 0 });
});

test('character stays inside world bounds', () => {
  const pos = stepPosition({ x: WORLD_RADIUS - 0.4, z: 0 }, new Set(['d']), 0.05);
  assert.ok(pos.x <= WORLD_RADIUS - 0.4);
});

test('school wall blocks movement while the door is a proximity interaction', () => {
  let pos = { x: 0, z: -6.34 };
  for (let i = 0; i < 20; i++) pos = stepPosition(pos, new Set(['w']), 0.05);
  assert.ok(pos.z > -6.75, 'player should not enter the school walls');
  assert.equal(isNearSchool({ x: 0, z: -5.5 }), true);
  assert.equal(isNearSchool({ x: 7, z: 2 }), false);
});

test('diagonal movement can slide along a building instead of tunneling through', () => {
  let pos = { x: 4.8, z: -6.2 };
  for (let i = 0; i < 30; i++) pos = stepPosition(pos, new Set(['a', 'w']), 0.05);
  assert.ok(pos.z >= -6.75 || pos.x >= 4.28);
});

test('camera-relative controls follow orbit heading without changing walking speed', () => {
  assert.deepEqual(movementVector(new Set(['w']), { x: -1, z: 0 }), { x: -1, z: 0 });
  assert.deepEqual(movementVector(new Set(['d']), { x: -1, z: 0 }), { x: 0, z: -1 });
  assert.deepEqual(movementVector(new Set(['s']), { x: -1, z: 0 }), { x: 1, z: 0 });
  const diagonal = movementVector(new Set(['w', 'd']), { x: -1, z: 0 });
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - 1) < 1e-10);
  assert.deepEqual(movementVector(new Set(['w']), { x: 0, z: 0 }), { x: 0, z: -1 });
  assert.deepEqual(movementVector(new Set(['w']), { x: Number.NaN, z: 0 }), { x: 0, z: -1 });
});

test('camera-relative movement respects the same world collision rules', () => {
  assert.deepEqual(stepPosition({ x: 0, z: 3.8 }, new Set(['w']), 0.05, 4, { x: -1, z: 0 }), { x: -0.2, z: 3.8 });
  let pos = { x: 0, z: -6.34 };
  for (let i = 0; i < 20; i++) pos = stepPosition(pos, new Set(['w']), 0.05, 4, { x: 0, z: -1 });
  assert.ok(pos.z > -6.75, 'rotated camera cannot bypass the school collision');
});

test('tree trunks have capsule-sized collision and cannot be crossed at sprint speed', () => {
  let position = { x: -8, z: 4 };
  for (let i = 0; i < 20; i++) position = stepPosition(position, new Set(['w']), 0.05, 6);
  assert.ok(position.z >= 3.64, 'player stops in front of the tree trunk');
  const sprint = stepPosition({ x: -8, z: 4 }, new Set(['w']), 0.05, 80);
  assert.ok(sprint.z >= 3.64, 'high speed cannot tunnel through a narrow tree');
});

test('tree collision allows sliding and leaves the central school walkway clear', () => {
  let position = { x: -8.7, z: 3.7 };
  for (let i = 0; i < 15; i++) position = stepPosition(position, new Set(['d', 'w']), 0.05);
  assert.ok(Math.hypot(position.x + 8, position.z - 3) >= 0.63 - 1e-8);
  let walkway = { x: 0, z: 3.8 };
  for (let i = 0; i < 50; i++) walkway = stepPosition(walkway, new Set(['w']), 0.05);
  assert.equal(isNearSchool(walkway), true, 'walking north reaches the entrance');
});

test('school activity prompt appears only at the front entrance', () => {
  assert.equal(isNearSchool({ x: 0, z: -5.5 }), true);
  assert.equal(isNearSchool({ x: 1.2, z: -5.3 }), true);
  assert.equal(isNearSchool({ x: 2.3, z: -5.5 }), false, 'side wall is not an entrance');
  assert.equal(isNearSchool({ x: 0, z: -3 }), false, 'far sidewalk is not the doorway');
  assert.equal(isNearSchool({ x: Number.NaN, z: -5.5 }), false);
});
