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


import { collectNpcFaceTargets, initialNpcFace, npcFaceTarget, advanceNpcFace, resetNpcFace } from '../src/world/npcFace.mjs';

function facialResident() {
  const names = ['eyeBlinkLeft', 'eyeLookDownLeft', 'eyeLookUpRight', 'eyeWideLeft', 'browInnerUp', 'jawOpen', 'mouthOpen', 'mouthSmileLeft', 'mouthSmileRight', 'cheekSquintLeft', 'tearTrackLeft'];
  const morphs = names.map(name => ({ name, influence: 0 }));
  return { morphs, targets: collectNpcFaceTargets([{ morphTargetManager: { numTargets: morphs.length, getTarget: i => morphs[i] } }]) };
}

test('NPC face collector excludes blink and droplet morphs owned by other animations', () => {
  const { targets } = facialResident();
  assert.ok(targets.some(target => target.name === 'jawOpen'));
  assert.ok(targets.some(target => target.name === 'eyeLookDownLeft'));
  assert.ok(!targets.some(target => target.name === 'eyeBlinkLeft' || target.name === 'tearTrackLeft'));
  assert.deepEqual(collectNpcFaceTargets([{}, { morphTargetManager: null }]), []);
});

test('NPC conversation animates jaw and lips without disturbing blinking', () => {
  const { targets, morphs } = facialResident();
  let state = initialNpcFace(0);
  const jaw = morphs.find(m => m.name === 'jawOpen');
  const mouth = morphs.find(m => m.name === 'mouthOpen');
  const lid = morphs.find(m => m.name === 'eyeBlinkLeft');
  lid.influence = 0.7;
  for (let i = 0; i < 100; i++) state = advanceNpcFace(state, 0.016, targets, { talking: true, blink: { left: 0.7, right: 0 } });
  assert.ok(jaw.influence > 0 && jaw.influence < 0.31);
  assert.ok(mouth.influence > 0 && mouth.influence < 0.24);
  assert.equal(lid.influence, 0.7);
  assert.ok(morphs.find(m => m.name === 'mouthSmileLeft').influence > 0);
});

test('nearby stationary residents acknowledge the player without talking', () => {
  assert.ok(npcFaceTarget('browInnerUp', 1, { nearby: true }) > 0);
  assert.equal(npcFaceTarget('jawOpen', 1, { nearby: true }), 0);
  assert.equal(npcFaceTarget('mouthSmileLeft', 1, { nearby: true, moving: true }), 0);
});

test('NPC flinch opens eyes and mouth and overrides conversational mouth movement', () => {
  const context = { talking: true, nearby: true, flinch: 1 };
  assert.ok(npcFaceTarget('eyeWideLeft', 0.5, context) > 0.4);
  assert.ok(npcFaceTarget('mouthOpen', 0.5, context) > 0.25);
  assert.equal(npcFaceTarget('jawOpen', 0.5, context), 0);
});

test('blink masks the matching NPC eye without suppressing the mouth', () => {
  const { targets, morphs } = facialResident();
  let state = initialNpcFace(0);
  for (let i = 0; i < 120; i++) state = advanceNpcFace(state, 0.016, targets, { flinch: 1, blink: { left: 1, right: 0 } });
  assert.equal(morphs.find(m => m.name === 'eyeWideLeft').influence, 0);
  assert.ok(morphs.find(m => m.name === 'mouthOpen').influence > 0);
});

test('residents speak independently and facial expressions recover after interruptions', () => {
  const a = facialResident(), b = facialResident();
  let first = initialNpcFace(0), second = initialNpcFace(2);
  for (let i = 0; i < 70; i++) {
    first = advanceNpcFace(first, 0.016, a.targets, { talking: true });
    second = advanceNpcFace(second, 0.016, b.targets, { talking: true });
  }
  assert.notEqual(a.morphs.find(m => m.name === 'jawOpen').influence, b.morphs.find(m => m.name === 'jawOpen').influence);
  for (let i = 0; i < 100; i++) first = advanceNpcFace(first, 0.016, a.targets, { moving: true });
  assert.ok(a.morphs.find(m => m.name === 'jawOpen').influence < 0.001);
  assert.ok(b.morphs.find(m => m.name === 'jawOpen').influence > 0);
});

test('NPC facial animation clamps invalid deltas and malformed inputs', () => {
  const { targets } = facialResident();
  let state = initialNpcFace(-1);
  for (const seconds of [NaN, Infinity, -5, 100, 0]) {
    state = advanceNpcFace(state, seconds, targets, { flinch: Infinity, blink: { left: NaN, right: -4 } });
    assert.ok(targets.every(target => Number.isFinite(target.influence) && target.influence >= 0 && target.influence <= 1));
  }
});

test('hidden NPCs clear facial reactions without resetting their blink animation', () => {
  const { targets, morphs } = facialResident();
  let state = initialNpcFace(3);
  state = advanceNpcFace(state, 0.08, targets, { flinch: 1 });
  morphs.find(m => m.name === 'eyeBlinkLeft').influence = 0.8;
  state = resetNpcFace(state, targets);
  assert.ok(targets.every(m => m.influence === 0));
  assert.equal(state.motions.size, 0);
  assert.equal(morphs.find(m => m.name === 'eyeBlinkLeft').influence, 0.8);
});
