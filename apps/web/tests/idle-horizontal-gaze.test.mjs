import test from 'node:test';
import assert from 'node:assert/strict';
import { idleGazeTarget } from '../src/world/gazeDynamics.mjs';
import { composeEyeExpression } from '../src/world/eyeExpression.mjs';

test('idle characters glance left and right using authored bilateral gaze morphs', () => {
  for (const [cycle, direction] of [[3, 'Left'], [5, 'Right']]) {
    const t = cycle * 4.8 + 1.0;
    const left = idleGazeTarget('eyeLook' + direction + 'Left', t, 'neutral', 0);
    const right = idleGazeTarget('eyeLook' + direction + 'Right', t, 'neutral', 0);
    assert.ok(left > 0.1 && right > left && right <= 0.2);
    const opposite = direction === 'Left' ? 'Right' : 'Left';
    for (const eye of ['Left', 'Right']) {
      assert.equal(idleGazeTarget('eyeLook' + opposite + eye, t, 'neutral', 0), 0);
      assert.equal(idleGazeTarget('eyeLookUp' + eye, t, 'neutral', 0), 0);
      assert.equal(idleGazeTarget('eyeLookDown' + eye, t, 'neutral', 0), 0);
    }
  }
});

test('horizontal saccades settle quickly instead of holding a sideways stare', () => {
  for (const [cycle, direction] of [[3, 'Left'], [5, 'Right']]) {
    const base = cycle * 4.8;
    const name = 'eyeLook' + direction + 'Left';
    assert.equal(idleGazeTarget(name, base + 0.4, 'neutral', 0), 0);
    assert.ok(idleGazeTarget(name, base + 1, 'neutral', 0) > 0.1);
    assert.equal(idleGazeTarget(name, base + 2.2, 'neutral', 0), 0);
    for (const edge of [base, base + 4.8]) {
      const before = idleGazeTarget(name, Math.max(0, edge - 0.01), 'neutral', 0);
      const after = idleGazeTarget(name, edge + 0.01, 'neutral', 0);
      assert.ok(Math.abs(after - before) < 0.003);
    }
  }
});

test('emotions and movement suppress micro-saccades without affecting deliberate eye tracking', () => {
  for (const name of ['eyeLookLeftLeft', 'eyeLookLeftRight', 'eyeLookRightLeft', 'eyeLookRightRight']) {
    for (const emotion of ['happy', 'sad', 'angry', 'fear', 'embarrassed', 'exerted']) {
      assert.equal(idleGazeTarget(name, 15.4, emotion, 0), 0);
    }
    for (const speed of [0.31, 1.8, 4, NaN, Infinity, -1]) {
      assert.equal(idleGazeTarget(name, 15.4, 'neutral', speed), 0);
    }
    for (const time of [NaN, Infinity, -Infinity, -1]) {
      assert.equal(idleGazeTarget(name, time, 'neutral', 0), 0);
    }
  }
  assert.equal(idleGazeTarget('eyeLookLeftLeft', 15.4, 'neutral', 0.3) > 0, true);
});

test('horizontal idle gaze remains compatible with independent blinking', () => {
  const weight = idleGazeTarget('eyeLookRightRight', 25, 'neutral', 0);
  assert.ok(weight > 0);
  assert.equal(composeEyeExpression('eyeLookRightRight', weight, { left: 0, right: 1 }), 0);
  assert.equal(composeEyeExpression('eyeLookRightRight', weight, { left: 1, right: 0 }), weight);
});
