import test from 'node:test';
import assert from 'node:assert/strict';
import { dropletCycle, stepDropletClock } from '../src/world/facialDroplets.mjs';

test('tear beads accelerate down their authored 3D tracks rather than sliding at constant speed', () => {
  const duration = 1.45;
  const quarter = dropletCycle(duration * 0.25, 'tear', 'Left').phase;
  const half = dropletCycle(duration * 0.5, 'tear', 'Left').phase;
  const threeQuarters = dropletCycle(duration * 0.75, 'tear', 'Left').phase;
  assert.ok(quarter > 0 && quarter < 0.25);
  assert.ok(half < 0.5 && half - quarter < threeQuarters - half);
  assert.ok(threeQuarters < 1);
});

test('sweat gathers more slowly than tears and both effects fade before the loop boundary', () => {
  const tear = dropletCycle(1.45 * 0.5, 'tear', 'Left');
  const sweat = dropletCycle(1.95 * 0.5, 'sweat', 'Left');
  assert.ok(sweat.phase < tear.phase);
  for (const kind of ['tear', 'sweat']) {
    const duration = kind === 'tear' ? 1.45 : 1.95;
    const nearEnd = dropletCycle(duration * 0.995, kind, 'Left');
    assert.ok(nearEnd.phase > 0.98);
    assert.ok(nearEnd.opacity < 0.1);
    assert.equal(dropletCycle(duration, kind, 'Left').opacity, 0);
  }
});

test('delayed right-side beads never emerge partway down the cheek', () => {
  for (const kind of ['tear', 'sweat']) {
    const duration = kind === 'tear' ? 1.45 : 1.95;
    assert.deepEqual(dropletCycle(duration * 0.2, kind, 'Right'), { phase: 0, opacity: 0 });
    assert.ok(dropletCycle(duration * 0.4, kind, 'Right').phase > 0);
    assert.equal(dropletCycle(0, kind, 'Left').phase, 0);
    assert.equal(dropletCycle(0, kind, 'Left').opacity, 0);
  }
});

test('droplet phase remains deterministic across time steps and episodes', () => {
  const oneStep = dropletCycle(0.5, 'tear', 'Left');
  let state = { elapsed: 0, active: false };
  for (let i = 0; i < 50; i++) state = stepDropletClock(state, 0.7, 0.01);
  assert.ok(Math.abs(dropletCycle(state.elapsed, 'tear', 'Left').phase - oneStep.phase) < 1e-12);
  state = stepDropletClock(state, 0, 0.016);
  state = stepDropletClock(state, 0.7, 0.016);
  assert.ok(dropletCycle(state.elapsed, 'tear', 'Left').phase < 0.01);
  for (const invalid of [NaN, Infinity, -Infinity, -2]) {
    const { phase, opacity } = dropletCycle(invalid, 'sweat', 'Right');
    assert.ok(Number.isFinite(phase) && Number.isFinite(opacity));
  }
});
