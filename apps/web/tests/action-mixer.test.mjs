import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACTION_FADE, JUMP, bodyLean, headingDelta, jumpHeight, startAction, stepAction, stopAction } from '../src/world/actionMixer.mjs';

const run = (state, seconds, step = 1 / 60) => {
  const weights = [];
  for (let t = 0; t < seconds && state; t += step) { const r = stepAction(state, step); state = r.state; weights.push(r.weight); }
  return { state, weights };
};

test('a one-shot fades in, plays and hands the body back by the end of the clip', () => {
  const { state, weights } = run(startAction('Interact', 1.2), 1.25);
  assert.equal(state, null);
  assert.ok(Math.max(...weights) === 1);
  assert.ok(weights[0] < 0.2, 'fades in');
  assert.ok(weights.at(-1) < 0.2, 'fades out');
  for (let i = 1; i < weights.length; i++) assert.ok(Math.abs(weights[i] - weights[i - 1]) <= 1 / 60 / ACTION_FADE + 1e-9, 'no pops');
});

test('a loop keeps playing until stopped, then fades out', () => {
  let { state } = run(startAction('Dance', 2), 5);
  assert.equal(state.name, 'Dance');
  assert.equal(stepAction(state, 0.016).weight, 1);
  state = stopAction(state);
  assert.equal(stopAction(state), state, 'stopping twice is harmless');
  assert.equal(run(state, ACTION_FADE + 0.05).state, null);
  assert.deepEqual(stepAction(null, 1), { state: null, weight: 0 });
});

test('jump arcs up and lands; lean banks into turns, cars roll out of them', () => {
  assert.equal(jumpHeight(0), 0);
  assert.ok(Math.abs(jumpHeight(JUMP.duration / 2) - JUMP.height) < 1e-9);
  assert.equal(jumpHeight(JUMP.duration), 0);
  const right = bodyLean({ yawRate: 1.5, speed: 4 });
  assert.ok(right.roll < 0, 'runner turning right leans right');
  assert.ok(bodyLean({ yawRate: 0, speed: 0, tired: true }).pitch > bodyLean({ yawRate: 0, speed: 0 }).pitch, 'tired slouch');
  const car = bodyLean({ kind: 'car', yawRate: 0.5, speed: 10, acceleration: -8 });
  assert.ok(car.roll > 0, 'body rolls to the outside');
  assert.ok(car.pitch > 0, 'nose dives under braking');
  assert.ok(Math.abs(bodyLean({ yawRate: 99, speed: 99 }).roll) <= 0.16, 'clamped');
  assert.ok(Math.abs(headingDelta(3.1, -3.1) - (2 * Math.PI - 6.2)) < 1e-9, 'wraps around');
});

test('the action clips are built for both bodies, credited CC0', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/models/human-actions.source.json', import.meta.url)));
  assert.equal(manifest.license, 'CC0-1.0');
  for (const file of ['human-actions.glb', 'human-female-actions.glb']) {
    const bytes = readFileSync(new URL(`../public/models/${file}`, import.meta.url));
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const names = gltf.animations.map(a => a.name);
    for (const clip of ['Talk', 'Sit', 'Drive', 'Interact', 'PickUp', 'JumpAir', 'JumpLand', 'Dance', 'Hit']) assert.ok(names.includes(clip), `${file}: ${clip}`);
    assert.ok(!gltf.meshes && !gltf.skins, 'clips and skeleton only');
    assert.ok(bytes.length < 1_000_000);
    for (const clip of gltf.animations) assert.ok(clip.channels.length >= 50);
  }
});
