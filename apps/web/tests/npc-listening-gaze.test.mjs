import test from 'node:test';
import assert from 'node:assert/strict';
import { npcListeningAttention, npcListeningOffset, npcListeningDown } from '../src/world/npcListeningGaze.mjs';
import { npcFaceTarget, initialNpcFace, advanceNpcFace } from '../src/world/npcFace.mjs';

const npc = { x: 0, z: 0 };
const playerAt = (distance, angle = 0) =>
  ({ x: distance * Math.sin(angle), z: -distance * Math.cos(angle) });

test('listening attention includes straight-ahead gaze, but excludes rear and peripheral targets', () => {
  assert.equal(npcListeningAttention(npc, playerAt(1.2), 0), 1);
  assert.ok(npcListeningAttention(npc, playerAt(1.2, Math.PI / 4), 0) > 0);
  assert.equal(npcListeningAttention(npc, playerAt(1.2, Math.PI / 2), 0), 0);
  assert.equal(npcListeningAttention(npc, { x: 0, z: 1.2 }, 0), 0);
  assert.equal(npcListeningAttention(npc, playerAt(1.2), Math.PI), 0);
  for (const invalid of [null, { x: NaN, z: 0 }, { x: Infinity, z: 0 }]) {
    assert.equal(npcListeningAttention(npc, invalid, 0), 0);
  }
  assert.equal(npcListeningAttention(npc, playerAt(1), NaN), 0);
});

test('attention fades continuously at personal-space, far-distance and cone boundaries', () => {
  const weight = distance => npcListeningAttention(npc, playerAt(distance), 0);
  assert.equal(weight(0.45), 0);
  assert.ok(weight(0.451) > 0 && weight(0.451) < 0.001);
  assert.ok(weight(0.6) < weight(0.8));
  assert.ok(weight(2.2) > weight(2.49) && weight(2.49) > 0);
  assert.ok(weight(2.499) < 0.001);
  assert.equal(weight(2.5), 0);
  const cone = angle => npcListeningAttention(npc, playerAt(1.2, angle), 0);
  assert.ok(cone(0.7) > cone(0.95) && cone(0.95) > cone(Math.PI / 3 - 0.001));
  assert.equal(cone(Math.PI / 3), 0);
});

test('independent fixation windows alternate horizontal direction and downward glances', () => {
  assert.equal(npcListeningOffset(0, 1, true), 0);
  assert.ok(npcListeningOffset(1.45, 1, true) > 0.06);
  assert.ok(npcListeningOffset(4.75, 1, true) < -0.05);
  assert.ok(npcListeningDown(6.5, 1, true) > 0.05);
  assert.equal(npcListeningDown(1.45, 1, true), 0);
  assert.equal(npcListeningOffset(6.5, 1, true), 0);
  assert.equal(npcListeningOffset(8.4, 1, true), 0);
  assert.ok(Math.abs(npcListeningOffset(1.45 + 8.4, 1, true) - npcListeningOffset(1.45, 1, true)) < 1e-12);
  assert.equal(npcListeningOffset(1.45, 0.5, true), npcListeningOffset(1.45, 1, true) / 2);
  assert.notEqual(npcListeningOffset(initialNpcFace(0).elapsed + 1.45, 1, true),
    npcListeningOffset(initialNpcFace(3).elapsed + 1.45, 1, true));
});

test('saccades stop during speech, movement, anger, sadness and startle', () => {
  const listening = { nearby: true, attention: 1, gaze: 0, emotion: 'neutral' };
  assert.ok(npcFaceTarget('eyeLookRightLeft', 1.45, listening) > 0);
  assert.ok(npcFaceTarget('eyeLookLeftLeft', 4.75, listening) > 0);
  assert.ok(npcFaceTarget('eyeLookDownRight', 6.5, listening) > 0);
  for (let t = 0; t < 12; t += 0.1) {
    assert.equal(npcFaceTarget('eyeLookUpLeft', t, listening), 0,
      'idle upward gaze must not oppose a listening downward fixation');
  }
  for (const context of [
    { talking: true }, { moving: true }, { emotion: 'sad' },
    { emotion: 'angry' }, { flinch: 1 }, { nearby: false }, { attention: 0 },
  ]) {
    assert.equal(npcFaceTarget('eyeLookRightLeft', 1.45, { ...listening, ...context }), 0);
  }
  for (const value of [NaN, Infinity, -Infinity, -1]) {
    assert.equal(npcListeningOffset(value, 1, true), 0);
    assert.equal(npcListeningDown(value, 1, true), 0);
  }
  assert.equal(npcListeningOffset(1.45, NaN, true), 0);
  assert.equal(npcListeningDown(6.5, Infinity, true), 0);
});

test('saccades preserve binocular convergence, one direction per eye, blink and cloned surface synchronization', () => {
  const context = { nearby: true, attention: 1, gaze: 0.12, vergence: 0.035 };
  for (const side of ['Left', 'Right']) {
    const right = npcFaceTarget(`eyeLookRight${side}`, 1.45, context);
    const left = npcFaceTarget(`eyeLookLeft${side}`, 1.45, context);
    assert.ok(right > 0 && left === 0);
    assert.ok(right <= 0.55);
  }
  assert.ok(npcFaceTarget('eyeLookRightLeft', 1.45, context) >
    npcFaceTarget('eyeLookRightRight', 1.45, context));
  const left = { name: 'eyeLookRightLeft', influence: 0 };
  const duplicate = { name: 'eyeLookRightLeft', influence: 0 };
  const right = { name: 'eyeLookRightRight', influence: 0 };
  let state = initialNpcFace(0);
  for (let i = 0; i < 25; i++) {
    state = advanceNpcFace(state, 1 / 60, [left, duplicate, right], {
      ...context, blink: { left: 1, right: 0 },
    });
  }
  assert.equal(left.influence, 0);
  assert.equal(duplicate.influence, 0);
  assert.ok(right.influence > 0);
  state = advanceNpcFace(state, 1 / 60, [left, duplicate, right], {
    ...context, blink: { left: 0, right: 0 },
  });
  assert.ok(left.influence > 0);
  assert.equal(left.influence, duplicate.influence);
});
