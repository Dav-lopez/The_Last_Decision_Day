import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCharacterEmotion } from '../src/world/characterEmotion.mjs';

test('neutral expression responds to actual sprint movement, not a Run toggle alone', () => {
  assert.equal(resolveCharacterEmotion('neutral', 0), 'neutral');
  assert.equal(resolveCharacterEmotion('neutral', 1.8), 'neutral');
  assert.equal(resolveCharacterEmotion('neutral', 4), 'exerted');
  assert.equal(resolveCharacterEmotion('neutral', 0), 'neutral');
  assert.equal(resolveCharacterEmotion('neutral', NaN), 'neutral');
});

test('explicitly selected expressions override automatic exertion', () => {
  for (const emotion of ['happy', 'sad', 'angry', 'fear', 'embarrassed', 'exerted']) {
    assert.equal(resolveCharacterEmotion(emotion, 4), emotion);
    assert.equal(resolveCharacterEmotion(emotion, 0), emotion);
  }
});

import { advanceFacialMorph, facialMorphFrequency } from '../src/world/faceDynamics.mjs';

function simulateMorph(name, goal, fps, seconds, start = { value: 0, velocity: 0 }) {
  let state = start;
  for (let frame = 0; frame < fps * seconds; frame++) {
    state = advanceFacialMorph(state, goal, 1 / fps, name);
    assert.ok(state.value >= 0 && state.value <= 1);
    assert.ok(Number.isFinite(state.velocity));
  }
  return state;
}

test('mouth, cheek and brow morphs converge independently of rendering frame rate', () => {
  for (const name of ['mouthSmileLeft', 'cheekSquintRight', 'browInnerUp', 'jawOpen']) {
    const at30 = simulateMorph(name, 0.8, 30, 1);
    const at60 = simulateMorph(name, 0.8, 60, 1);
    const at120 = simulateMorph(name, 0.8, 120, 1);
    assert.ok(Math.abs(at30.value - 0.8) < 0.002, name);
    assert.ok(Math.abs(at30.value - at60.value) < 1e-10, name);
    assert.ok(Math.abs(at60.value - at120.value) < 1e-10, name);
  }
});

test('interrupted smile reverses smoothly without snapping to neutral', () => {
  const opening = simulateMorph('mouthSmileLeft', 1, 60, 0.2);
  assert.ok(opening.value > 0 && opening.value < 1);
  const reversed = advanceFacialMorph(opening, 0, 1 / 60, 'mouthSmileLeft');
  assert.ok(reversed.value > 0 && reversed.value < 1);
  const settled = simulateMorph('mouthSmileLeft', 0, 60, 1, reversed);
  assert.ok(settled.value < 0.002);
});

test('cheeks settle more gently than jaw opening', () => {
  assert.ok(facialMorphFrequency('cheekSquintLeft') < facialMorphFrequency('jawOpen'));
  const cheek = simulateMorph('cheekSquintLeft', 1, 60, 0.2);
  const jaw = simulateMorph('jawOpen', 1, 60, 0.2);
  assert.ok(jaw.value > cheek.value);
});

test('invalid frames and malformed states never create NaN or out-of-range morphs', () => {
  const malformed = advanceFacialMorph({ value: NaN, velocity: Infinity }, Infinity, NaN, 'browInnerUp');
  assert.deepEqual(malformed, { value: 0, velocity: 0 });
  assert.deepEqual(advanceFacialMorph({ value: 0.3, velocity: 0 }, 1, -1), { value: 0.3, velocity: 0 });
  const capped = advanceFacialMorph({ value: 0, velocity: 0 }, 1, 3600, 'jawOpen');
  assert.ok(capped.value > 0 && capped.value < 1, 'background resume must not jump to full expression');
});


import { idleGazeTarget } from '../src/world/gazeDynamics.mjs';

test('idle gaze animates bilateral up/down morphs without exceeding its influence budget', () => {
  for (let i = 0; i < 2000; i++) {
    const time = i * 0.01;
    for (const name of ['eyeLookUpLeft', 'eyeLookUpRight', 'eyeLookDownLeft', 'eyeLookDownRight']) {
      const value = idleGazeTarget(name, time, 'neutral', 0);
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 0.16, name + ' at ' + time);
    }
  }
  assert.ok(idleGazeTarget('eyeLookDownLeft', 1, 'neutral', 0) > 0.1);
  assert.ok(idleGazeTarget('eyeLookUpRight', 5.8, 'neutral', 0) > 0.1);
  assert.equal(idleGazeTarget('eyeLookUpRight', 10.6, 'neutral', 0), 0);
});

test('gaze is eased across cycle boundaries and never competes with emotions or movement', () => {
  for (const name of ['eyeLookUpLeft', 'eyeLookUpRight', 'eyeLookDownLeft', 'eyeLookDownRight']) {
    for (const boundary of [0, 4.8, 9.6, 14.4]) {
      const before = idleGazeTarget(name, Math.max(0, boundary - 0.01), 'neutral', 0);
      const after = idleGazeTarget(name, boundary + 0.01, 'neutral', 0);
      assert.ok(Math.abs(after - before) < 0.003, name + ' at ' + boundary);
    }
    for (const emotion of ['sad', 'fear', 'embarrassed', 'happy', 'angry', 'exerted']) {
      assert.equal(idleGazeTarget(name, 1, emotion, 0), 0);
    }
    assert.equal(idleGazeTarget(name, 1, 'neutral', 1.8), 0);
  }
});

test('idle gaze rejects malformed time, speed and non-gaze morph names', () => {
  for (const bad of [NaN, Infinity, -Infinity, -1]) {
    assert.equal(idleGazeTarget('eyeLookDownLeft', bad, 'neutral', 0), 0);
    assert.equal(idleGazeTarget('eyeLookDownLeft', 1, 'neutral', bad), 0);
  }
  for (const name of ['eyeBlinkLeft', 'eyeWideRight', 'jawOpen', 'eyeLookUp', 'eyeLookDownCenter']) {
    assert.equal(idleGazeTarget(name, 1, 'neutral', 0), 0);
  }
});

test('bilateral gaze has slight asymmetry but never divergent directions', () => {
  const left = idleGazeTarget('eyeLookDownLeft', 1, 'neutral', 0);
  const right = idleGazeTarget('eyeLookDownRight', 1, 'neutral', 0);
  assert.ok(left > 0 && right > left && right - left < 0.02);
  assert.equal(idleGazeTarget('eyeLookUpLeft', 1, 'neutral', 0), 0);
});

// Exercise horizontal idle-gaze regressions in the existing CI emotion test entrypoint.
import './idle-horizontal-gaze.test.mjs';
