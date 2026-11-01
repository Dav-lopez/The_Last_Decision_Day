import test from 'node:test';
import assert from 'node:assert/strict';
import { stepBlink } from '../src/world/blinkCycle.mjs';

const zero = () => ({ elapsed: 0, count: 0 });
function advance(state, seconds, dt = 0.01) {
  let result;
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    result = stepBlink(state, Math.min(dt, seconds - t));
    state = result;
  }
  return result;
}

test('eyes close and reopen smoothly with subtle left/right staggering', () => {
  const a = advance(zero(), 2.70);
  assert.ok(a.left > 0 && a.left < 1);
  assert.ok(a.right > 0 && a.right < a.left);
  const closed = advance(zero(), 2.76);
  assert.ok(closed.left > 0.99 && closed.right > 0.9);
  const opened = advance(zero(), 2.96);
  assert.equal(opened.left, 0);
  assert.equal(opened.right, 0);
});

test('blink timing is consistent across common render frame rates', () => {
  const a = advance(zero(), 8, 0.01);
  const b = advance(zero(), 8, 0.02);
  assert.equal(a.count, b.count);
  assert.ok(Math.abs(a.elapsed - b.elapsed) < 1e-6);
});

test('invalid or long frame deltas do not cause nonfinite eyelid influences', () => {
  let s = advance(zero(), 2.68);
  for (const dt of [NaN, Infinity, -10, 100, 0]) {
    s = stepBlink(s, dt);
    for (const key of ['left', 'right']) assert.ok(Number.isFinite(s[key]) && s[key] >= 0 && s[key] <= 1);
  }
});

test('blink cadence varies, with a brief double blink after eight cycles', () => {
  let s = zero();
  const starts = [];
  let prior = 0;
  for (let i = 0; i < 3500; i++) {
    s = stepBlink(s, 0.1);
    if (s.count !== prior) { starts.push(i * 0.1); prior = s.count; }
  }
  assert.ok(starts.length > 9);
  assert.ok(starts[8] - starts[7] < 1);
  assert.ok(starts[3] - starts[2] > 2.5);
});

// Exercise emotional eyelid reflexes through the existing character CI test script.
import './emotion-blink.test.mjs';
