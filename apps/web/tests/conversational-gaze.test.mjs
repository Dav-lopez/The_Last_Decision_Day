import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationalGazeTarget, avatarGazeTarget } from '../src/world/conversationalGaze.mjs';

const eyes = ['Left', 'Right'];
const dirs = ['Up', 'Down', 'Left', 'Right'];
const gaze = (dir, side, t, fade = 1) => conversationalGazeTarget(`eyeLook${dir}${side}`, t, fade);

test('short, bounded downward and alternating sideways glances keep a forward fixation', () => {
  for (const side of eyes) {
    assert.equal(gaze('Down', side, 0.3), 0);
    assert.ok(gaze('Down', side, 1.1) > 0.08);
    assert.equal(gaze('Down', side, 2.2), 0);
    assert.ok(gaze('Left', side, 3.4) > 0.1);
    assert.equal(gaze('Right', side, 3.4), 0);
    assert.ok(gaze('Right', side, 5.4 + 3.4) > 0.1);
    assert.equal(gaze('Left', side, 5.4 + 3.4), 0);
  }
});

test('eyes track together, never activate opposite directions and remain bounded', () => {
  for (let i = 0; i < 1400; i++) {
    const t = i / 100;
    const weights = dirs.map(dir => gaze(dir, 'Right', t));
    assert.ok(weights.every(v => Number.isFinite(v) && v >= 0 && v <= 0.14));
    assert.ok(weights.filter(v => v > 0).length <= 1);
    for (const dir of dirs) assert.ok(Math.abs(gaze(dir, 'Left', t) - gaze(dir, 'Right', t) * 0.97) < 1e-10);
  }
});

test('chat fade reduces gaze, invalid inputs and non-eye morphs are safe', () => {
  assert.ok(Math.abs(gaze('Down', 'Right', 1.1, 0.5) - gaze('Down', 'Right', 1.1) / 2) < 1e-10);
  for (const invalid of [NaN, Infinity, -1, undefined]) {
    assert.equal(conversationalGazeTarget('eyeLookDownLeft', invalid, 1), 0);
    assert.equal(conversationalGazeTarget('eyeLookDownLeft', 1.1, invalid), 0);
  }
  for (const name of ['jawOpen', 'eyeBlinkLeft', 'eyeLookDown', null, 'eyeLookLeftBoth']) {
    assert.equal(conversationalGazeTarget(name, 1.1, 1), 0);
  }
});

test('talking replaces idle gaze; movement and emotions suppress conversational drift', () => {
  assert.equal(avatarGazeTarget('eyeLookDownRight', 1, 'neutral', 0, true, 0.2, 1), 0);
  assert.ok(avatarGazeTarget('eyeLookDownRight', 1, 'neutral', 0, true, 1.1, 1) > 0);
  assert.equal(avatarGazeTarget('eyeLookDownRight', 1, 'neutral', 0.31, true, 1.1, 1), 0);
  assert.equal(avatarGazeTarget('eyeLookDownRight', 1, 'sad', 0, true, 1.1, 1), 0);
  assert.equal(avatarGazeTarget('eyeLookDownRight', 1, 'neutral', 0, false, 1.1, 0.5), gaze('Down', 'Right', 1.1, 0.5));
  assert.equal(avatarGazeTarget('eyeLookDownRight', 1, 'neutral', 0, false, 1.1, 0), 0.16);
});
