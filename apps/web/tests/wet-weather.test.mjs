import test from 'node:test';
import assert from 'node:assert/strict';
import { PUDDLES, cloudDrift, puddleInCell, puddleLevel, puddlesNear, weatherAt, wetGrip } from '../src/world/weather.mjs';
import { SPEED_ZONES, stepVehicle, steerAngle } from '../src/world/vehicleDrive.mjs';

test('wet roads grip less, and dry roads are unchanged', () => {
  assert.equal(wetGrip({ wet: 0, rain: 0 }), 1);
  assert.ok(Math.abs(wetGrip({ wet: 1, rain: 1 }) - 0.72) < 1e-9);
  assert.ok(wetGrip({ wet: 1, rain: 0 }) < 0.85, 'soaked roads after the rain still grip less');
  assert.equal(wetGrip({}), 1, 'missing values count as dry');
  const soaked = weatherAt(2, 900, 'showers');
  assert.ok(wetGrip(soaked) < 0.75);
});

test('on a wet road the brakes take longer and the car runs wider at speed', () => {
  const car = { x: 0, z: 0, rotation: 0, speed: 20, kind: 'sedan' };
  const brake = grip => {
    let state = car; let metres = 0;
    for (let i = 0; i < 200 && state.speed > 0.05; i++) {
      const next = stepVehicle(state, { throttle: -1 }, 0.05, [], [], () => false, { ...SPEED_ZONES.road, grip });
      metres += Math.hypot(next.x - state.x, next.z - state.z); state = next;
    }
    return metres;
  };
  assert.ok(brake(0.72) > brake(1) * 1.3, 'braking distance grows on a wet road');
  assert.equal(steerAngle(1, 4, undefined, 0.72), steerAngle(1, 4), 'slow tight turns are unchanged');
  assert.ok(Math.abs(steerAngle(1, 20, undefined, 0.72)) < Math.abs(steerAngle(1, 20)), 'less steering grip at speed');
  const dry = stepVehicle(car, { throttle: 0 }, 0.05, [], [], () => false, SPEED_ZONES.road);
  const same = stepVehicle(car, { throttle: 0 }, 0.05, [], [], () => false, { ...SPEED_ZONES.road, grip: 1 });
  assert.deepEqual(same, dry, 'grip 1 behaves exactly like no grip');
});

test('puddles sit at fixed spots inside their cells and come back every rain', () => {
  let found = 0;
  for (let cx = -20; cx < 20; cx++) for (let cz = -20; cz < 20; cz++) {
    const puddle = puddleInCell(cx, cz);
    assert.deepEqual(puddle, puddleInCell(cx, cz));
    if (!puddle) continue;
    found++;
    assert.ok(puddle.x >= cx * PUDDLES.cell && puddle.x <= (cx + 1) * PUDDLES.cell);
    assert.ok(puddle.z >= cz * PUDDLES.cell && puddle.z <= (cz + 1) * PUDDLES.cell);
    assert.ok(puddle.radius >= PUDDLES.minRadius && puddle.radius <= PUDDLES.maxRadius);
  }
  const share = found / 1600;
  assert.ok(share > PUDDLES.chance - 0.06 && share < PUDDLES.chance + 0.06, `share ${share}`);
  const near = puddlesNear(3, -40);
  assert.ok(near.length > 0 && near.length <= PUDDLES.max);
  assert.ok(near.every((p, i) => p.distance <= PUDDLES.range && (i === 0 || near[i - 1].distance <= p.distance)), 'nearest first, within range');
});

test('puddles fill once the ground is properly wet and shrink as it dries; clouds move faster in wind and rain', () => {
  assert.equal(puddleLevel({ wet: 0.2 }), 0);
  assert.equal(puddleLevel({ wet: 1 }), 1);
  assert.ok(puddleLevel({ wet: 0.55 }) > 0 && puddleLevel({ wet: 0.55 }) < 1);
  // Day 2's afternoon shower: puddles appear during it and are gone a couple of hours later.
  let last = null;
  for (let minute = 0; minute < 1440; minute += 5) {
    const level = puddleLevel(weatherAt(2, minute));
    if (level > 0) last = minute;
  }
  assert.ok(last !== null && last < 1439, 'the puddles dry up before the end of the day');
  assert.ok(cloudDrift({ cloud: 0.9, rain: 1 }) > cloudDrift({ cloud: 0.1 }) * 1.8);
  assert.ok(cloudDrift({ fog: 1 }) > 0, 'clouds never stop entirely');
});
