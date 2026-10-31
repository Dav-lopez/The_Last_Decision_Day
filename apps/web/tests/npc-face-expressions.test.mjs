import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collectNpcFaceTargets, initialNpcFace, npcFaceTarget, advanceNpcFace, resetNpcFace } from '../src/world/npcFace.mjs';
import { npcAttentionGaze } from '../src/world/npcAttentionGaze.mjs';
import { npcIdleMicroExpression } from '../src/world/npcMicroExpression.mjs';

const weight = (name, emotion, extra = {}) => npcFaceTarget(name, 0.23, { emotion, talking: true, nearby: true, ...extra });
const morph = name => ({ name, influence: 0 });

test('both shipped character bodies have actual bilateral frown, gaze and squint morphs', () => {
  for (const body of ['human.glb', 'human-female.glb']) {
    const raw = readFileSync(new URL(`../public/models/${body}`, import.meta.url));
    const length = raw.readUInt32LE(12);
    const gltf = JSON.parse(raw.subarray(20, 20 + length).toString());
    const names = new Set(gltf.meshes.flatMap(mesh => mesh.extras?.targetNames ?? []));
    for (const name of ['mouthFrownLeft', 'mouthFrownRight', 'eyeSquintLeft', 'eyeSquintRight',
      'eyeLookDownLeft', 'eyeLookDownRight', 'browInnerUp']) {
      assert.ok(names.has(name), `${body} missing ${name}`);
    }
  }
});

test('collects frown targets on each skinned surface but never owns blink or droplets', () => {
  const names = ['mouthFrownLeft', 'mouthFrownRight', 'mouthSmileLeft', 'eyeSquintLeft',
    'eyeBlinkLeft', 'tearTrackLeft', 'sweatTrackRight', 'unrelated'];
  const targets = collectNpcFaceTargets([{ morphTargetManager: {
    numTargets: names.length, getTarget: i => morph(names[i]),
  } }, { morphTargetManager: null }]);
  assert.deepEqual(targets.map(t => t.name), names.slice(0, 4));
});

test('sad dialogue produces an asymmetric frown, lowered gaze and narrow watery eyes without smiling', () => {
  assert.ok(weight('mouthFrownLeft', 'sad') > weight('mouthFrownRight', 'sad') > 0);
  assert.ok(weight('eyeSquintLeft', 'sad') > weight('eyeSquintRight', 'sad') > 0);
  assert.ok(weight('eyeLookDownLeft', 'sad') > 0);
  assert.ok(weight('browInnerUp', 'sad') > 0);
  assert.equal(weight('mouthSmileLeft', 'sad'), 0);
  assert.equal(weight('mouthSmileRight', 'sad'), 0);
});

test('happy and neutral conversations keep smiles but do not create frowns', () => {
  assert.ok(weight('mouthSmileLeft', 'happy') > 0);
  assert.ok(weight('cheekSquintLeft', 'happy') > weight('cheekSquintLeft', 'neutral'));
  assert.equal(weight('mouthFrownLeft', 'happy'), 0);
  assert.equal(weight('mouthFrownRight', 'neutral'), 0);
  assert.ok(weight('mouthSmileRight', 'neutral') > 0);
});

test('surprise interrupts sadness and speech while widening eyes and opening the mouth', () => {
  assert.equal(weight('mouthFrownLeft', 'sad', { flinch: 1 }), 0);
  assert.equal(weight('mouthSmileLeft', 'happy', { flinch: 1 }), 0);
  assert.equal(weight('eyeLookDownRight', 'sad', { flinch: 1 }), 0);
  assert.ok(weight('eyeWideLeft', 'sad', { flinch: 1 }) > 0);
  assert.ok(weight('mouthOpen', 'sad', { flinch: 1 }) > 0);
  assert.equal(weight('jawOpen', 'neutral', { talking: false, moving: true, flinch: 0 }), 0);
});

test('conversation mouths articulate independently of mood and never require phoneme audio', () => {
  const a = weight('mouthOpen', 'sad');
  const b = npcFaceTarget('mouthOpen', 0.41, { emotion: 'sad', talking: true });
  assert.ok(a > 0 && b > 0 && a !== b);
  assert.ok(weight('jawOpen', 'happy') > 0);
  assert.equal(weight('mouthOpen', 'happy', { talking: false }), 0);
});

test('shared facial surfaces remain synchronized and eye blink masking stays bilateral', () => {
  const left = morph('eyeSquintLeft'), duplicate = morph('eyeSquintLeft');
  const right = morph('eyeSquintRight'), frown = morph('mouthFrownLeft');
  let state = initialNpcFace(3);
  for (let i = 0; i < 25; i++) {
    state = advanceNpcFace(state, 1 / 60, [left, duplicate, right, frown],
      { emotion: 'sad', talking: true, blink: { left: 1, right: 0 } });
  }
  assert.equal(left.influence, 0, 'closed left eyelid masks only left eye');
  assert.ok(right.influence > 0 && frown.influence > 0);
  assert.equal(left.influence, duplicate.influence, 'duplicate morphs share one spring');
  state = advanceNpcFace(state, 1 / 60, [left, duplicate, right, frown],
    { emotion: 'sad', blink: { left: 0, right: 0 } });
  assert.ok(left.influence > 0, 'left eye recovers without losing its expression');
});

test('two residents have independent emotions and reset clears stale facial springs', () => {
  const a = [morph('mouthFrownLeft'), morph('mouthSmileLeft')];
  const b = [morph('mouthFrownLeft'), morph('mouthSmileLeft')];
  let sad = initialNpcFace(1), happy = initialNpcFace(2);
  for (let i = 0; i < 35; i++) {
    sad = advanceNpcFace(sad, 1 / 60, a, { emotion: 'sad', talking: true });
    happy = advanceNpcFace(happy, 1 / 60, b, { emotion: 'happy', talking: true });
  }
  assert.ok(a[0].influence > 0 && a[1].influence === 0);
  assert.ok(b[1].influence > 0 && b[0].influence === 0);
  sad = resetNpcFace(sad, a);
  assert.equal(a[0].influence, 0);
  assert.equal(sad.motions.size, 0);
  assert.ok(b[1].influence > 0, 'other resident remains unaffected');
});

test('invalid timestamps, flinch and frame durations never create nonfinite morphs', () => {
  for (const elapsed of [NaN, Infinity, -Infinity, -10]) for (const flinch of [NaN, Infinity, -Infinity, -5, 5]) {
    for (const name of ['mouthFrownLeft', 'mouthOpen', 'eyeLookDownRight', 'eyeSquintLeft']) {
      const value = npcFaceTarget(name, elapsed, { emotion: 'sad', talking: true, flinch });
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${name} ${elapsed} ${flinch}`);
    }
  }
  const targets = [morph('mouthFrownLeft'), morph('eyeSquintLeft')];
  let state = initialNpcFace(0);
  for (const seconds of [NaN, Infinity, -1, 999]) {
    state = advanceNpcFace(state, seconds, targets, { emotion: 'sad' });
    assert.ok(targets.every(t => Number.isFinite(t.influence) && t.influence >= 0 && t.influence <= 1));
  }
});

test('horizontal eye focus follows a nearby player relative to body heading', () => {
  const npc = { x: 0, z: 0 };
  const right = npcAttentionGaze(npc, { x: 0.7, z: -1 }, 0);
  const left = npcAttentionGaze(npc, { x: -0.7, z: -1 }, 0);
  assert.ok(right > 0 && left < 0 && Math.abs(right + left) < 1e-12);
  assert.ok(npcFaceTarget('eyeLookRightLeft', 0, { nearby: true, gaze: right }) > 0);
  assert.ok(npcFaceTarget('eyeLookRightRight', 0, { nearby: true, gaze: right }) > 0);
  assert.equal(npcFaceTarget('eyeLookLeftLeft', 0, { nearby: true, gaze: right }), 0);
  assert.ok(npcFaceTarget('eyeLookLeftRight', 0, { nearby: true, gaze: left }) > 0);
  assert.ok(npcAttentionGaze(npc, { x: -1, z: -0.7 }, Math.PI / 2) > 0);
});

test('eye focus ignores behind, distance, movement, distress and malformed inputs', () => {
  const npc = { x: 0, z: 0 };
  for (const player of [null, { x: 0, z: 1 }, { x: 0, z: -5 },
    { x: 0, z: 0 }, { x: Infinity, z: 0 }, { x: 2, z: -0.1 }]) {
    assert.equal(npcAttentionGaze(npc, player, 0), 0);
  }
  assert.equal(npcAttentionGaze(npc, { x: 1, z: -1 }, NaN), 0);
  for (const context of [{ moving: true }, { nearby: false }, { emotion: 'sad' }, { flinch: 1 }]) {
    assert.equal(npcFaceTarget('eyeLookRightLeft', 0, { nearby: true, gaze: 0.4, ...context }), 0);
  }
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.equal(npcFaceTarget('eyeLookRightLeft', 0, { nearby: true, gaze: bad }), 0);
  }
});

test('horizontal gaze is smoothed, blink-masked and synchronized across meshes', () => {
  const left = morph('eyeLookRightLeft'), duplicate = morph('eyeLookRightLeft');
  const right = morph('eyeLookRightRight');
  let state = initialNpcFace(1);
  for (let i = 0; i < 25; i++) {
    state = advanceNpcFace(state, 1 / 60, [left, duplicate, right], {
      nearby: true, gaze: 0.4, blink: { left: 1, right: 0 },
    });
  }
  assert.equal(left.influence, 0);
  assert.equal(duplicate.influence, 0);
  assert.ok(right.influence > 0);
  state = advanceNpcFace(state, 1 / 60, [left, duplicate, right], {
    nearby: true, gaze: 0.4, blink: { left: 0, right: 0 },
  });
  assert.ok(left.influence > 0);
  assert.equal(left.influence, duplicate.influence);
  resetNpcFace(state, [left, duplicate, right]);
  assert.equal(left.influence, 0);
  assert.equal(right.influence, 0);
});

test('NPC eye attention eases in at personal-space and far-distance boundaries', () => {
  const npc = { x: 0, z: 0 };
  const target = distance => ({ x: distance * Math.sin(Math.PI / 9), z: -distance * Math.cos(Math.PI / 9) });
  const gaze = distance => npcAttentionGaze(npc, target(distance), 0);
  assert.equal(gaze(0.35), 0);
  assert.ok(0 < gaze(0.36) && gaze(0.36) < gaze(0.5));
  assert.ok(gaze(0.5) < gaze(0.7));
  assert.ok(gaze(1.2) > gaze(2.1) && gaze(2.1) > gaze(2.4));
  assert.ok(gaze(2.4) > gaze(2.49) && gaze(2.49) > 0);
  assert.equal(gaze(2.5), 0);
  assert.ok(gaze(0.351) < 0.001, 'eyes do not pop open at the near threshold');
  assert.ok(gaze(2.499) < 0.001, 'eyes do not snap at the far threshold');
});

test('NPC horizontal eye contact fades continuously at the peripheral cone', () => {
  const npc = { x: 0, z: 0 };
  const gaze = degrees => {
    const angle = degrees * Math.PI / 180;
    return npcAttentionGaze(npc, { x: 1.2 * Math.sin(angle), z: -1.2 * Math.cos(angle) }, 0);
  };
  assert.ok(gaze(35) > gaze(45) && gaze(45) > gaze(50));
  assert.ok(gaze(50) > gaze(59) && gaze(59) > 0);
  assert.ok(gaze(59.9) < 0.001, 'eyes settle before leaving the attention cone');
  assert.equal(gaze(60), 0);
  assert.equal(gaze(70), 0);
  for (const degrees of [10, 35, 45, 55, 59.9]) {
    assert.ok(Math.abs(gaze(degrees) + gaze(-degrees)) < 1e-12, 'left/right attention stays mirrored');
  }
});

test('NPC eye attention remains finite for malformed and extreme target positions', () => {
  const npc = { x: 0, z: 0 };
  for (const target of [null, {}, { x: NaN, z: 1 }, { x: Infinity, z: 0 },
    { x: 1e308, z: -1e308 }, { x: 0, z: 0 }]) {
    const gaze = npcAttentionGaze(npc, target, 0);
    assert.ok(Number.isFinite(gaze) && Math.abs(gaze) <= 0.55);
  }
  assert.equal(npcAttentionGaze(npc, { x: 1, z: -1 }, Infinity), 0);
});

test('unattended residents make short, coordinated left and right idle glances', () => {
  for (const [direction, cycle] of [['Left', 3], ['Right', 5]]) {
    const time = cycle * 4.8 + 1;
    const left = npcFaceTarget(`eyeLook${direction}Left`, time);
    const right = npcFaceTarget(`eyeLook${direction}Right`, time);
    assert.ok(left > 0 && right > left && right <= 0.20, `${direction} glance is bilateral`);
    const opposite = direction === 'Left' ? 'Right' : 'Left';
    assert.equal(npcFaceTarget(`eyeLook${opposite}Left`, time), 0,
      'opposing horizontal gaze must not activate');
    assert.equal(npcFaceTarget(`eyeLook${direction}Left`, cycle * 4.8 + 0.4), 0,
      'eyes remain centred before the saccade');
    assert.equal(npcFaceTarget(`eyeLook${direction}Left`, cycle * 4.8 + 2.2), 0,
      'eyes return to centre after fixation');
  }
});

test('player attention, conversations, movement and distress suppress idle eye glances', () => {
  const time = 3 * 4.8 + 1;
  const morphName = 'eyeLookLeftLeft';
  assert.ok(npcFaceTarget(morphName, time) > 0);
  for (const context of [
    { nearby: true, gaze: 0 }, { talking: true }, { moving: true },
    { emotion: 'sad' }, { emotion: 'happy' }, { flinch: 1 },
  ]) {
    assert.equal(npcFaceTarget(morphName, time, context), 0, JSON.stringify(context));
  }
  assert.ok(npcFaceTarget('eyeLookRightLeft', time, { nearby: true, gaze: 0.4 }) > 0,
    'active attention continues to take precedence');
  assert.equal(npcFaceTarget('eyeLookLeftLeft', time, { nearby: true, gaze: 0.4 }), 0);
});

test('idle horizontal gaze remains blink-masked and synchronized across cloned face meshes', () => {
  const left = morph('eyeLookLeftLeft'), duplicate = morph('eyeLookLeftLeft');
  const right = morph('eyeLookLeftRight');
  let state = initialNpcFace(0);
  state.elapsed = 3 * 4.8 + 1;
  for (let i = 0; i < 12; i++) {
    state = advanceNpcFace(state, 1 / 60, [left, duplicate, right], {
      blink: { left: 1, right: 0 },
    });
  }
  assert.equal(left.influence, 0);
  assert.equal(left.influence, duplicate.influence);
  assert.ok(right.influence > 0);
  state = advanceNpcFace(state, 1 / 60, [left, duplicate, right], {
    blink: { left: 0, right: 0 },
  });
  assert.ok(left.influence > 0);
  assert.equal(left.influence, duplicate.influence);
});

test('idle residents show brief, asymmetric curiosity and half-smiles separated by rest', () => {
  const brow = npcIdleMicroExpression('browInnerUp', 1.2);
  assert.ok(brow > 0.08 && brow <= 0.09);
  assert.ok(npcIdleMicroExpression('cheekSquintLeft', 1.2) > npcIdleMicroExpression('cheekSquintRight', 1.2));
  assert.equal(npcIdleMicroExpression('mouthSmileLeft', 1.2), 0, 'curiosity is not a smile');

  const smileTime = 7.2 + 1.5;
  assert.ok(npcIdleMicroExpression('mouthSmileLeft', smileTime) > npcIdleMicroExpression('mouthSmileRight', smileTime) > 0);
  assert.ok(npcIdleMicroExpression('cheekSquintLeft', smileTime) > 0);
  assert.equal(npcIdleMicroExpression('mouthFrownLeft', smileTime), 0);
  assert.equal(npcIdleMicroExpression('eyeBlinkLeft', smileTime), 0, 'blink has its own animator');
  assert.equal(npcIdleMicroExpression('mouthSmileLeft', 14.4 + 1.5), 0, 'every third cycle rests');
});

test('idle micro-expressions have smooth zero endpoints and reject malformed inputs', () => {
  for (const t of [0, 0.85, 2.3, 7.2, 8.2, 10.0]) {
    assert.equal(npcIdleMicroExpression('browInnerUp', t), 0);
  }
  assert.ok(npcIdleMicroExpression('browInnerUp', 0.851) < 0.001);
  assert.ok(npcIdleMicroExpression('browInnerUp', 2.299) < 0.001);
  for (const t of [NaN, Infinity, -Infinity, -1]) {
    assert.equal(npcIdleMicroExpression('browInnerUp', t), 0);
  }
  assert.equal(npcIdleMicroExpression(null, 1.2), 0);
  assert.equal(npcIdleMicroExpression('browInnerUp', 1.2, { flinch: NaN }), 0);
});

test('talking, player proximity, movement and distress suppress idle expressions', () => {
  const time = 8.7;
  assert.ok(npcFaceTarget('mouthSmileLeft', time) > 0);
  for (const context of [
    { talking: true }, { nearby: true }, { moving: true },
    { emotion: 'sad' }, { emotion: 'happy' }, { flinch: 0.2 },
  ]) {
    assert.equal(npcIdleMicroExpression('mouthSmileLeft', time, context), 0);
  }
  assert.equal(npcFaceTarget('mouthSmileLeft', time, { emotion: 'sad' }), 0,
    'a sad resident must never inherit an idle grin');
  assert.equal(npcFaceTarget('mouthSmileLeft', time, { moving: true }), 0);
});

test('resident offsets desynchronize micro-expressions and shared mesh morphs stay identical', () => {
  const a = initialNpcFace(0), b = initialNpcFace(4);
  a.elapsed = 1.2;
  assert.ok(npcIdleMicroExpression('browInnerUp', a.elapsed) > 0);
  assert.equal(npcIdleMicroExpression('browInnerUp', b.elapsed), 0);

  const brow = morph('browInnerUp'), duplicate = morph('browInnerUp');
  let state = a;
  for (let i = 0; i < 18; i++) state = advanceNpcFace(state, 1 / 60, [brow, duplicate]);
  assert.ok(brow.influence > 0);
  assert.equal(brow.influence, duplicate.influence, 'cloned facial surfaces share one spring');
  state = resetNpcFace(state, [brow, duplicate]);
  assert.equal(brow.influence, 0);
  assert.equal(state.motions.size, 0);
});
