import test from 'node:test';
import assert from 'node:assert/strict';
import { initialEmotionBlink, stepEmotionBlink, combineBlinkFrames } from '../src/world/emotionBlink.mjs';
import { composeEyeExpression } from '../src/world/eyeExpression.mjs';

const tick = (state, emotion, seconds, dt = 0.01) => {
  for (let elapsed = 0; elapsed < seconds - 1e-10;) {
    const frame = Math.min(dt, seconds - elapsed);
    state = stepEmotionBlink(state, emotion, frame);
    elapsed += frame;
  }
  return state;
};

test('fear onset closes and reopens eyelids once, not once per frame', () => {
  let state = initialEmotionBlink();
  state = tick(state, 'fear', 0.085);
  assert.equal(state.kind, 'fear');
  assert.ok(state.left > 0.9 && state.right > 0.75);
  state = tick(state, 'fear', 0.30);
  assert.equal(state.kind, null);
  assert.equal(state.left, 0);
  assert.equal(state.right, 0);
  state = tick(state, 'fear', 0.8);
  assert.equal(state.kind, null, 'sustained fear must not loop the reflex');
});

test('embarrassment creates a softer, slower blink than fear', () => {
  const fear = tick(initialEmotionBlink(), 'fear', 0.065);
  const embarrassed = tick(initialEmotionBlink(), 'embarrassed', 0.065);
  assert.ok(fear.left > embarrassed.left);
  const later = tick(initialEmotionBlink(), 'embarrassed', 0.115);
  assert.ok(later.left > 0.70 && later.left < 0.73);
  assert.ok(later.right > 0 && later.right < later.left);
});

test('refractory period prevents repeated dialogue emotion flicker from triggering blinks', () => {
  let state = tick(initialEmotionBlink(), 'fear', 0.35);
  assert.equal(state.kind, null);
  state = tick(state, 'neutral', 0.05);
  state = tick(state, 'fear', 0.05);
  assert.equal(state.kind, null);
  state = tick(state, 'neutral', 1.3);
  state = stepEmotionBlink(state, 'fear', 0.016);
  assert.equal(state.kind, 'fear');
});

test('changing from fear to embarrassment during a blink does not restart it', () => {
  let state = tick(initialEmotionBlink(), 'fear', 0.07);
  const before = state.elapsed;
  state = stepEmotionBlink(state, 'embarrassed', 0.01);
  assert.equal(state.kind, 'fear');
  assert.ok(state.elapsed > before);
});

test('reactive eyelids combine with natural blink without overclosure or disrupting gaze masking', () => {
  const natural = { left: 0.4, right: 0.6 };
  const reflex = { left: 0.8, right: 0.2 };
  const combined = combineBlinkFrames(natural, reflex);
  assert.ok(Math.abs(combined.left - 0.88) < 1e-12);
  assert.ok(Math.abs(combined.right - 0.68) < 1e-12);
  assert.equal(composeEyeExpression('eyeWideLeft', 0.5, combined), 0.5 * (1 - combined.left));
  assert.equal(composeEyeExpression('mouthSmileLeft', 0.5, combined), 0.5);
  assert.deepEqual(combineBlinkFrames(natural, null), natural);
});

test('frame-rate variation and invalid inputs cannot create nonfinite eyelids', () => {
  const a = tick(initialEmotionBlink(), 'embarrassed', 0.17, 0.01);
  const b = tick(initialEmotionBlink(), 'embarrassed', 0.17, 0.02);
  assert.ok(Math.abs(a.left - b.left) < 1e-10);
  for (const delta of [NaN, Infinity, -4, 100, 0]) {
    const state = stepEmotionBlink({ emotion: 'neutral', kind: 'fear', elapsed: NaN, cooldown: Infinity }, 'fear', delta);
    const blend = combineBlinkFrames({ left: Infinity, right: -1 }, state);
    for (const value of [state.left, state.right, state.cooldown, blend.left, blend.right]) {
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 1.2);
    }
  }
});
