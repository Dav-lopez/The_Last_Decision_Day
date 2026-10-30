import test from 'node:test';
import assert from 'node:assert/strict';
import { composeEyeExpression } from '../src/world/eyeExpression.mjs';

test('a fully closed blink suppresses competing squint and wide morphs', () => {
  for (const name of ['eyeWideLeft', 'eyeWideRight', 'eyeSquintLeft', 'eyeSquintRight']) {
    assert.equal(composeEyeExpression(name, 0.8, {left: 1, right: 1}), 0);
    assert.equal(composeEyeExpression(name, 0.8, {left: 0, right: 0}), 0.8);
  }
});

test('staggered blinks affect only the corresponding eye', () => {
  const blink = {left: 1, right: 0.25};
  assert.equal(composeEyeExpression('eyeWideLeft', 0.8, blink), 0);
  assert.ok(Math.abs(composeEyeExpression('eyeWideRight', 0.8, blink) - 0.6) < 1e-12);
  assert.ok(Math.abs(composeEyeExpression('eyeSquintRight', 0.8, blink) - 0.6) < 1e-12);
});

test('mouth, cheeks and brow continue expressing during a blink', () => {
  for (const name of ['mouthSmileLeft', 'mouthFrownRight', 'cheekSquintLeft', 'browInnerUp', 'jawOpen']) {
    assert.equal(composeEyeExpression(name, 0.7, {left: 1, right: 1}), 0.7);
  }
});

test('invalid values cannot create NaN or out-of-range morph weights', () => {
  for (const expression of [NaN, Infinity, -1, 3]) {
    for (const blink of [null, {left: NaN, right: Infinity}, {left: -1, right: 3}]) {
      for (const name of ['eyeSquintLeft', 'eyeWideRight', 'mouthOpen']) {
        const value = composeEyeExpression(name, expression, blink);
        assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
      }
    }
  }
});
