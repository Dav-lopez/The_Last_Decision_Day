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
