import test from 'node:test';
import assert from 'node:assert/strict';
import { actionFacialWeight } from '../src/world/actionFacial.mjs';
import { startAction, stepAction, stopAction } from '../src/world/actionMixer.mjs';

const state = (name, elapsed) => ({ name, elapsed });

test('Talk and SitTalk animate both mouth and jaw while other actions do not', () => {
  for (const name of ['Talk', 'SitTalk']) {
    const opens = [0.03, 0.1, 0.2, 0.3, 0.4].map(t => actionFacialWeight('mouthOpen', state(name, t), 1));
    assert.ok(opens.some(x => x > 0.15));
    assert.ok(new Set(opens.map(x => x.toFixed(3))).size > 2);
    assert.ok(actionFacialWeight('jawOpen', state(name, 0.1), 1) > 0);
  }
  for (const name of ['Drive', 'Sit', 'Dance', 'JumpAir', 'Interact', 'PickUp']) {
    assert.equal(actionFacialWeight('mouthOpen', state(name, 0.1), 1), 0, name);
  }
});

test('speech leaves blinks, gaze, tears and unknown morphs unchanged', () => {
  for (const name of ['eyeBlinkLeft', 'eyeLookDownRight', 'browInnerUp', 'tearTrackLeft', 'unknown']) {
    assert.equal(actionFacialWeight(name, state('Talk', 0.15), 1), 0);
  }
});

test('phrase pauses close the mouth and recover at the next phrase', () => {
  assert.ok(actionFacialWeight('mouthOpen', state('Talk', 1.7), 1) > 0);
  for (const t of [2.15, 2.3, 2.55]) assert.equal(actionFacialWeight('mouthOpen', state('Talk', t), 1), 0);
  assert.ok(actionFacialWeight('mouthOpen', state('Talk', 2.7), 1) > 0);
});

test('action mixer fade controls speech and ends without stale facial influence', () => {
  let action = startAction('Talk', 2, true);
  let step = stepAction(action, 0.09);
  const half = actionFacialWeight('mouthOpen', step.state, step.weight);
  assert.ok(half > 0);
  const full = actionFacialWeight('mouthOpen', step.state, 1);
  assert.ok(Math.abs(half - full * step.weight) < 1e-12);
  action = stopAction(step.state);
  step = stepAction(action, 0.1);
  assert.ok(step.weight < 1 && step.weight > 0);
  step = stepAction(step.state, 0.1);
  assert.equal(step.state, null);
  assert.equal(actionFacialWeight('mouthOpen', step.state, step.weight), 0);
});

test('bad time, fade and morph input never produce nonfinite weights', () => {
  for (const time of [NaN, Infinity, -Infinity, -1]) {
    assert.equal(actionFacialWeight('jawOpen', state('Talk', time), 1), 0);
  }
  for (const weight of [NaN, Infinity, -Infinity, -1, 0]) {
    assert.equal(actionFacialWeight('jawOpen', state('Talk', 0.2), weight), 0);
  }
  for (let i = 0; i < 10000; i++) {
    for (const name of ['mouthOpen', 'jawOpen', 'mouthPressLeft', 'mouthPressRight', 'mouthSmileLeft', 'mouthSmileRight']) {
      const value = actionFacialWeight(name, state('Talk', i / 60), 1);
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${name} ${i}`);
    }
  }
});


import { advanceSharedFacialMorph } from '../src/world/facialMorphSync.mjs';
import { advanceFacialMorph } from '../src/world/faceDynamics.mjs';

test('split lip and cheek meshes receive one identical spring step per frame', () => {
  const motions = new Map(), frame = new Map();
  const expected = advanceFacialMorph({ value: 0, velocity: 0 }, 0.8, 1 / 60, 'mouthOpen');
  const lip = advanceSharedFacialMorph('mouthOpen', 0, 0.8, 1 / 60, null, motions, frame);
  const duplicateLip = advanceSharedFacialMorph('mouthOpen', 0.9, 0, 1 / 60, null, motions, frame);
  assert.equal(lip, expected.value);
  assert.equal(duplicateLip, lip, 'a second mesh must not advance the spring again');
  assert.deepEqual(motions.get('mouthOpen'), expected);

  frame.clear();
  const following = advanceSharedFacialMorph('mouthOpen', 0, 0, 1 / 60, null, motions, frame);
  const expectedFollowing = advanceFacialMorph(expected, 0, 1 / 60, 'mouthOpen');
  assert.equal(following, expectedFollowing.value, 'a new frame must use the retained spring velocity');
  assert.equal(advanceSharedFacialMorph('mouthOpen', 0, 1, 1 / 60, null, motions, frame), following);
});

test('eye surfaces share blink-masked gaze without losing the underlying expression', () => {
  const motions = new Map(), frame = new Map();
  const closed = advanceSharedFacialMorph('eyeWideLeft', 0, 0.9, 0.04,
    { left: 1, right: 0 }, motions, frame);
  assert.equal(closed, 0);
  assert.equal(advanceSharedFacialMorph('eyeWideLeft', 0, 0, 0.04,
    { left: 0, right: 0 }, motions, frame), 0);
  assert.ok(motions.get('eyeWideLeft').value > 0, 'blink masking must not erase the spring');
  frame.clear();
  const open = advanceSharedFacialMorph('eyeWideLeft', 0, 0.9, 0.04,
    { left: 0, right: 0 }, motions, frame);
  assert.ok(open > 0);
  assert.equal(advanceSharedFacialMorph('eyeWideLeft', 0, 0.9, 0.04,
    { left: 0, right: 0 }, motions, frame), open);
});

import { stepSpeechOverlay } from '../src/world/speechOverlay.mjs';

test('remote facial-only speech eases in and out without changing body clips', () => {
  let overlay = { elapsed: 0, weight: 0 };
  for (let i = 0; i < 30; i++) overlay = stepSpeechOverlay(overlay, true, 1 / 60);
  assert.ok(overlay.weight > 0.99);
  assert.ok(overlay.elapsed > 0.4);
  assert.ok(actionFacialWeight('jawOpen', { name: 'Talk', elapsed: 0.2 }, overlay.weight) > 0);
  assert.equal(actionFacialWeight('eyeBlinkLeft', { name: 'Talk', elapsed: 0.2 }, overlay.weight), 0);
  const before = overlay.weight;
  overlay = stepSpeechOverlay(overlay, false, 1 / 60);
  assert.ok(overlay.weight < before && overlay.weight > 0);
  for (let i = 0; i < 100; i++) overlay = stepSpeechOverlay(overlay, false, 1 / 60);
  assert.deepEqual(overlay, { elapsed: 0, weight: 0 });
});

test('speech overlay clamps bad frame deltas and malformed state', () => {
  for (const dt of [NaN, Infinity, -Infinity, -1, 0]) {
    assert.deepEqual(stepSpeechOverlay({ elapsed: 0, weight: 0 }, true, dt),
      { elapsed: 0, weight: 0 });
  }
  const safe = stepSpeechOverlay({ elapsed: Infinity, weight: NaN }, true, 1);
  assert.ok(Number.isFinite(safe.elapsed) && Number.isFinite(safe.weight));
  assert.ok(safe.weight > 0 && safe.weight < 1);
});
