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
