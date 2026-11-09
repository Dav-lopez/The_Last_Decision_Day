import test from 'node:test';
import assert from 'node:assert/strict';
import { HEAD_GESTURES, HEAD_GESTURE_LIMITS, headGestureFor, headGestureOffset } from '../src/world/headGestures.mjs';

test('lines pick a fitting head gesture', () => {
  assert.equal(headGestureFor("Hey — you're the new kid from the blue house, right? I'm Maya."), 'nod');
  assert.equal(headGestureFor('Every choice adds up. Got it.'), 'nod');
  assert.equal(headGestureFor('You found the photo. Ana Rivera, Association secretary. Yes, I left the note.'), 'nod');
  assert.equal(headGestureFor('A real crossing and a slow zone? Good call, kid.'), 'nod');
  assert.equal(headGestureFor('…Who is A?'), 'tilt');
  assert.equal(headGestureFor('Maybe Ms. Rivera can help.'), 'tilt');
  assert.equal(headGestureFor('No. Not today.'), 'shake');
  assert.equal(headGestureFor("Never. I won't."), 'shake');
  assert.equal(headGestureFor('No pressure, then.'), null, '"No pressure" is not a refusal');
  assert.equal(headGestureFor('Laps first. Then the fun stuff.'), null);
  assert.equal(headGestureFor(''), null);
  assert.equal(headGestureFor(undefined), null);
});

test('gestures start and end still, stay within the head limits, and move the right way', () => {
  for (const [name, shape] of Object.entries(HEAD_GESTURES)) {
    assert.deepEqual(headGestureOffset(name, 0), { yaw: 0, pitch: 0, roll: 0 });
    assert.deepEqual(headGestureOffset(name, shape.seconds), { yaw: 0, pitch: 0, roll: 0 });
    let moved = 0;
    for (let t = 0; t < shape.seconds; t += 0.01) {
      const a = headGestureOffset(name, t);
      for (const axis of ['yaw', 'pitch', 'roll']) assert.ok(Math.abs(a[axis]) <= HEAD_GESTURE_LIMITS[axis] + 1e-9, `${name} ${axis} at ${t}`);
      moved = Math.max(moved, Math.abs(a.yaw) + Math.abs(a.pitch) + Math.abs(a.roll));
    }
    assert.ok(moved > 0.08, `${name} is visible (${moved})`);
  }
  // A nod only dips (never tips the head back); a shake swings both ways; a tilt leans one way and holds.
  const nods = [], shakes = [];
  for (let t = 0.01; t < 1.3; t += 0.01) { nods.push(headGestureOffset('nod', t).pitch); shakes.push(headGestureOffset('shake', t).yaw); }
  assert.ok(nods.every(p => p >= 0));
  assert.ok(Math.min(...shakes) < -0.1 && Math.max(...shakes) > 0.1);
  assert.deepEqual(headGestureOffset(null, 0.5), { yaw: 0, pitch: 0, roll: 0 });
  assert.deepEqual(headGestureOffset('wave', 0.5), { yaw: 0, pitch: 0, roll: 0 });
  assert.deepEqual(headGestureOffset('nod', NaN), { yaw: 0, pitch: 0, roll: 0 });
});
