import test from 'node:test';
import assert from 'node:assert/strict';
import { dropletCycle } from '../src/world/facialDroplets.mjs';

test('tear and sweat droplets move and fade without out-of-range values', () => {
  for (const kind of ['tear', 'sweat']) {
    for (const side of ['Left', 'Right']) {
      for (const seconds of [0, 0.1, 0.4, 1.3, 4.7, 100, NaN, -1]) {
        const { phase, opacity } = dropletCycle(seconds, kind, side);
        assert.ok(Number.isFinite(phase) && phase >= 0 && phase < 1);
        assert.ok(Number.isFinite(opacity) && opacity >= 0 && opacity <= 1);
      }
    }
  }
});

test('the left and right droplets are staggered and the animation loops', () => {
  assert.notEqual(dropletCycle(0.5, 'tear', 'Left').phase, dropletCycle(0.5, 'tear', 'Right').phase);
  assert.ok(Math.abs(dropletCycle(0.2, 'tear', 'Left').phase - dropletCycle(1.65, 'tear', 'Left').phase) < 1e-9);
  assert.equal(dropletCycle(0, 'tear', 'Left').opacity, 0);
});

test('invalid kinds and sides are rejected', () => {
  assert.throws(() => dropletCycle(1, 'rain', 'Left'));
  assert.throws(() => dropletCycle(1, 'tear', 'Center'));
});
