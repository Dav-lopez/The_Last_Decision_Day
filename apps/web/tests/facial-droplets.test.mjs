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

import { calculateFacialEffectTargets, stepFacialEffectWeights } from '../src/world/facialEffectDynamics.mjs';

const noEffects = { tears: 0, blush: 0, sweat: 0, wateryEyes: 0 };
function effectsAfter(target, seconds, frames) {
  let state = noEffects;
  for (let i = 0; i < frames; i++) state = stepFacialEffectWeights(state, target, seconds / frames);
  return state;
}

test('watery eyes precede visible tear tracks during sadness', () => {
  const state = effectsAfter(calculateFacialEffectTargets('sad', 0), 0.3, 18);
  assert.ok(state.wateryEyes > 0.8);
  assert.ok(state.tears > 0 && state.tears < 0.4);
});

test('exertion sweat fades more slowly than it builds', () => {
  const rising = effectsAfter(calculateFacialEffectTargets('exerted', 0), 0.4, 20);
  const falling = stepFacialEffectWeights(rising, noEffects, 0.4);
  assert.ok(rising.sweat > 0.45);
  assert.ok(falling.sweat > rising.sweat * 0.65);
});

test('effect attack and release envelopes are frame-rate independent', () => {
  const target = calculateFacialEffectTargets('sad', 0);
  const coarse = effectsAfter(target, 1, 10);
  const fine = effectsAfter(target, 1, 120);
  for (const key of Object.keys(noEffects)) assert.ok(Math.abs(coarse[key] - fine[key]) < 1e-12, key);
});

test('invalid timing and intensity cannot corrupt facial material opacity', () => {
  assert.deepEqual(calculateFacialEffectTargets('neutral', NaN), noEffects);
  for (const seconds of [NaN, Infinity, -2, 0, 1e9]) {
    const state = stepFacialEffectWeights(
      { tears: NaN, blush: Infinity, sweat: -2, wateryEyes: 5 },
      { tears: Infinity, blush: -4, sweat: 2, wateryEyes: 0.5 },
      seconds,
    );
    for (const value of Object.values(state)) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
  }
});

test('switching emotions releases stale tear and eye effects', () => {
  const sad = effectsAfter(calculateFacialEffectTargets('sad', 0), 1, 60);
  const embarrassed = stepFacialEffectWeights(sad, calculateFacialEffectTargets('embarrassed', 0), 0.5);
  assert.ok(embarrassed.tears < sad.tears);
  assert.ok(embarrassed.wateryEyes < sad.wateryEyes);
  assert.ok(embarrassed.blush > 0);
});

import { stepDropletClock } from '../src/world/facialDroplets.mjs';

test('new crying episodes begin at the tear duct on both sides', () => {
  for (const kind of ['tear', 'sweat']) {
    for (const side of ['Left', 'Right']) {
      const atOnset = dropletCycle(0, kind, side);
      assert.equal(atOnset.phase, 0);
      assert.equal(atOnset.opacity, 0);
    }
    const early = dropletCycle(0.25, kind, 'Right');
    assert.equal(early.opacity, 0, 'right drop should not materialize midway down the cheek');
    assert.ok(dropletCycle(0.5, kind, 'Left').phase > dropletCycle(0.5, kind, 'Right').phase);
  }
});

test('droplet clocks reset between episodes but preserve motion while fading', () => {
  const start = stepDropletClock({ elapsed: 9, active: false }, 0.8, 0.016);
  assert.ok(start.active && start.elapsed > 0 && start.elapsed < 0.02);
  const ongoing = stepDropletClock(start, 0.15, 0.08);
  assert.ok(ongoing.elapsed > start.elapsed, 'release envelope must not restart visible droplets');
  const stopped = stepDropletClock(ongoing, 0.01, 0.08);
  assert.deepEqual(stopped, { elapsed: 0, active: false });
  const restarted = stepDropletClock(stopped, 0.8, 0.016);
  assert.equal(restarted.elapsed, start.elapsed);
});

test('droplet clocks reject invalid intensities and bounded timing spikes', () => {
  for (const intensity of [NaN, Infinity, -1, 0]) {
    assert.deepEqual(stepDropletClock({ elapsed: 2, active: true }, intensity, 1), { elapsed: 0, active: false });
  }
  const invalid = { elapsed: Infinity, active: true };
  assert.deepEqual(stepDropletClock(invalid, 0.9, NaN), { elapsed: 0, active: true });
  assert.deepEqual(stepDropletClock(invalid, 0.9, 100), { elapsed: 0.1, active: true });
});
