import test from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY, createQuality, stepQuality } from '../src/world/adaptiveQuality.mjs';

const run = (state, fps, seconds) => {
  const changes = [];
  for (let t = 0; t < seconds; t += 1 / fps) { const r = stepQuality(state, 1 / fps); state = r.state; if (r.changed) changes.push({ scale: state.scale, ao: state.ambientOcclusion }); }
  return { state, changes };
};

test('a slow device steps the resolution down, then drops ambient occlusion, and never below half resolution', () => {
  const { state, changes } = run(createQuality(1 / 1.5), 30, 30);
  assert.ok(changes.length >= 2);
  assert.ok(changes[0].scale > 1 / 1.5);
  assert.equal(state.scale, QUALITY.maxScale);
  assert.equal(state.ambientOcclusion, false);
  for (let i = 1; i < changes.length; i++) assert.ok(changes[i].scale >= changes[i - 1].scale);
});

test('with headroom it climbs back to the native resolution and turns ambient occlusion back on', () => {
  const slow = run(createQuality(1), 30, 30).state;
  const { state } = run(slow, 60, 120);
  assert.equal(state.scale, 1);
  assert.equal(state.ambientOcclusion, true);
});

test('a fast device is left alone; pauses and bad frame times are ignored', () => {
  const { changes } = run(createQuality(1), 60, 20);
  assert.equal(changes.length, 0);
  const state = createQuality(1);
  assert.equal(stepQuality(state, 5).changed, false, 'a 5 s pause (tab switch) is not a slow frame');
  assert.equal(stepQuality(state, Number.NaN).changed, false);
  assert.equal(createQuality(-3).base, 1);
});

test('between 50 and 58 fps nothing flips back and forth', () => {
  const { changes } = run(createQuality(1), 54, 30);
  assert.equal(changes.length, 0);
});
