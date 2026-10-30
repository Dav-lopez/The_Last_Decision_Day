import test from 'node:test';
import assert from 'node:assert/strict';
import { initialNpcBlink, collectNpcEyelids, advanceNpcBlink } from '../src/world/npcBlink.mjs';

test('each NPC blinks independently rather than in lockstep', () => {
  const a = initialNpcBlink(0);
  const b = initialNpcBlink(1);
  assert.notEqual(a.elapsed, b.elapsed);
  const aLeft = { name: 'eyeBlinkLeft', influence: 0 };
  const bLeft = { name: 'eyeBlinkLeft', influence: 0 };
  let first = a, second = b;
  for (let i = 0; i < 235; i++) {
    first = advanceNpcBlink(first, 0.01, { left: [aLeft], right: [] });
    second = advanceNpcBlink(second, 0.01, { left: [bLeft], right: [] });
  }
  assert.notEqual(first.left, second.left);
  assert.notEqual(aLeft.influence, bLeft.influence);
});

test('only blink targets are modified; eye expression and lips are untouched', () => {
  const left = { name: 'eyeBlinkLeft', influence: 0 };
  const right = { name: 'eyeBlinkRight', influence: 0 };
  const smile = { name: 'mouthSmileLeft', influence: 0.6 };
  const squint = { name: 'eyeSquintLeft', influence: 0.25 };
  const meshes = [{ morphTargetManager: { numTargets: 4, getTarget: i => [left, right, smile, squint][i] } }];
  const targets = collectNpcEyelids(meshes);
  assert.equal(targets.left.length, 1);
  assert.equal(targets.right.length, 1);
  const result = advanceNpcBlink({ elapsed: 2.7, count: 0 }, 0.05, targets);
  assert.ok(result.left > 0);
  assert.ok(result.right > 0);
  assert.equal(left.influence, result.left);
  assert.equal(right.influence, result.right);
  assert.equal(smile.influence, 0.6);
  assert.equal(squint.influence, 0.25);
});

test('legacy meshes and invalid frame deltas are safe', () => {
  const targets = collectNpcEyelids([{ morphTargetManager: null }, {}]);
  assert.deepEqual(targets, { left: [], right: [] });
  let state = initialNpcBlink(-1);
  for (const dt of [NaN, Infinity, -5, 100, 0]) {
    state = advanceNpcBlink(state, dt, targets);
    assert.ok(Number.isFinite(state.left) && state.left >= 0 && state.left <= 1);
    assert.ok(Number.isFinite(state.right) && state.right >= 0 && state.right <= 1);
  }
});
