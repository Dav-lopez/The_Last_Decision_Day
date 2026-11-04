import test from 'node:test';
import assert from 'node:assert/strict';
import { HOSE, aimAt, createFire, hoseReport, hoseStatus, particleBudget, placeFire, stepFire } from '../src/world/fireHose.mjs';

const fire = () => createFire({ x: 10, z: 0 });
// Standing 5 m west of the fire, facing east.
const aimed = { x: 5, z: 0, dx: 1, dz: 0 };

const spray = (state, from, seconds, spraying = true) => {
  let event = null;
  for (let t = 0; t < seconds - 1e-9; t += 0.05) {
    const r = stepFire(state, { ...from, spraying, seconds: 0.05 });
    state = r.fire;
    event ??= r.event;
  }
  return { fire: state, event };
};

test('the fire sits a few metres along the pavement from the stop', () => {
  assert.deepEqual(placeFire({ x: 0, z: 0 }, { x: 0, z: 2 }), { x: 0, z: 5 });
  const at = placeFire({ x: 1, z: 1 }, { x: 3, z: 4 }, 10);
  assert.ok(Math.abs(at.x - 7) < 1e-9 && Math.abs(at.z - 9) < 1e-9);
  assert.deepEqual(placeFire({ x: 0, z: 0 }, null), { x: 5, z: 0 }, 'no direction still gives a spot');
});

test('aim: in reach and facing the flames, best between 3 and 6 metres', () => {
  const f = fire();
  const a = aimAt(f, aimed);
  assert.equal(a.onTarget, true);
  assert.equal(a.inRange, true);
  assert.equal(a.quality, 1);
  assert.equal(a.hint, null);
  assert.equal(aimAt(f, { x: -5, z: 0, dx: 1, dz: 0 }).hint, 'closer');
  assert.equal(aimAt(f, { x: 9.5, z: 0, dx: 1, dz: 0 }).hint, 'back');
  assert.equal(aimAt(f, { x: 5, z: 0, dx: 0, dz: 1 }).hint, 'aim', 'facing along the street misses');
  assert.equal(aimAt(f, { x: 5, z: 0, dx: -1, dz: 0 }).quality, 0, 'back to the fire');
  // Slightly off centre or near the end of the jet still works, just less well.
  const off = aimAt(f, { x: 5, z: 0, dx: Math.cos(0.3), dz: Math.sin(0.3) });
  assert.ok(off.quality > 0 && off.quality < 1);
  const far = aimAt(f, { x: 2, z: 0, dx: 1, dz: 0 });
  assert.ok(far.quality > 0 && far.quality < 1);
  assert.equal(aimAt(f, { x: 5, z: 0, dx: 0, dz: 0 }).quality, 0, 'no facing, no aim');
});

test('holding the spray on the fire puts it out in a few seconds; it says so once', () => {
  const { fire: out, event } = spray(fire(), aimed, 6);
  assert.equal(event, 'out');
  assert.equal(out.out, true);
  assert.equal(out.heat, 0);
  const seconds = Math.ceil((1 - HOSE.out) / HOSE.knockdown);
  assert.ok(out.sprayed >= seconds - 1 && out.sprayed <= seconds + 0.5, `sprayed ${out.sprayed}s`);
  assert.ok(Math.abs(out.water - out.sprayed * HOSE.flow) < 1, 'water is counted while the nozzle is open');
  const again = stepFire(out, { ...aimed, spraying: true, seconds: 0.1 });
  assert.equal(again.event, null);
  assert.equal(again.fire.hitting, false);
  assert.ok(again.fire.burning > 0, 'smoulder timer runs after it is out');
});

test('missing wastes water, and an untouched fire creeps back (never past where it started)', () => {
  let f = spray(fire(), aimed, 2).fire;
  const knocked = f.heat;
  assert.ok(knocked < 0.6);
  const miss = spray(f, { ...aimed, dx: 0, dz: 1 }, 2).fire;
  assert.equal(miss.heat, knocked, 'spraying the street does nothing to the fire');
  assert.ok(miss.water > f.water);
  assert.equal(miss.sprayed, f.sprayed);
  const left = spray(miss, aimed, 4, false).fire;
  assert.ok(left.heat > knocked, 'it flares back up');
  assert.equal(spray(fire(), aimed, 30, false).fire.heat, 1);
  // A huge frame is capped so a stall can't skip the fight.
  assert.ok(stepFire(fire(), { ...aimed, spraying: true, seconds: 10 }).fire.heat > 0.9);
});

test('the duty card says what to fix, then how the job went', () => {
  const f = fire();
  assert.deepEqual(hoseStatus(f, aimAt(f, aimed)), { left: 100, line: 'Hold Space or HOSE to spray' });
  assert.equal(hoseStatus(f, aimAt(f, aimed), true).line, 'Keep it on the base of the flames');
  assert.equal(hoseStatus(f, aimAt(f, { x: -5, z: 0, dx: 1, dz: 0 })).line, 'Get closer to the fire');
  assert.equal(hoseStatus(f, aimAt(f, { x: 5, z: 0, dx: 0, dz: 1 })).line, 'Turn to face the flames');
  assert.equal(hoseStatus(f, aimAt(f, { x: 9.5, z: 0, dx: 1, dz: 0 })).line, 'Step back a little');
  const half = spray(f, aimed, 2).fire;
  assert.ok(hoseStatus(half, aimAt(half, aimed)).left < 60);
  const clean = spray(f, aimed, 6).fire;
  assert.equal(hoseStatus(clean, null).line, 'Fire out');
  const report = hoseReport(clean);
  assert.equal(report.grade, 'Clean knockdown');
  assert.ok(report.litres >= 30 && report.litres % 10 === 0);
  const sloppy = spray(spray(f, { ...aimed, dx: 0, dz: 1 }, 8).fire, aimed, 6).fire;
  assert.equal(hoseReport(sloppy).grade, 'Soaked the street');
  assert.equal(hoseReport(null).litres, 0);
});

test('particles shrink with adaptive quality', () => {
  const full = particleBudget({ scale: 1, base: 1 });
  const mid = particleBudget({ scale: 1.4, base: 1 });
  const low = particleBudget({ scale: 2, base: 1 });
  assert.ok(full.flames > mid.flames && mid.flames > low.flames);
  assert.ok(low.water > 0 && low.smoke > 0);
  assert.deepEqual(particleBudget(null), full);
});
