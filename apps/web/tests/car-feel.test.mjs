import test from 'node:test';
import assert from 'node:assert/strict';
import { GEARS, createGearbox, createSkidMarks, engineFrequency, skidCapacityFor, stepGearbox, tyreSlip, SKID } from '../src/world/carFeel.mjs';
import { VEHICLE, driveInput, stepVehicle } from '../src/world/vehicleDrive.mjs';

const free = () => false;
const run = (car, input, seconds) => {
  let state = car;
  for (let t = 0; t < seconds; t += 1 / 60) state = stepVehicle(state, input, 1 / 60, [], [], free);
  return state;
};

test('the gearbox climbs through three gears, dipping the revs at each shift', () => {
  let box = createGearbox();
  const gears = [], shifts = [];
  let previousRpm = box.rpm;
  for (let speed = 0; speed <= 9; speed += 0.05) {
    const next = stepGearbox(box, speed, 1, 1 / 60);
    if (next.shifted) shifts.push({ gear: next.gear, before: previousRpm, after: next.rpm });
    gears.push(next.gear);
    previousRpm = next.rpm;
    box = next;
  }
  assert.deepEqual([...new Set(gears)], [1, 2, 3]);
  assert.equal(shifts.length, 2);
  // Revs fall back after an up-shift (the next frames, as the note settles).
  let after = box;
  for (let i = 0; i < 4; i++) after = stepGearbox(after, 9, 1, 1 / 60);
  assert.ok(after.rpm > 0.75, 'near the top of third at top speed');
  assert.ok(engineFrequency(after.rpm, 3) > engineFrequency(0.2, 1));
});

test('the gearbox does not hunt between gears around a shift point, and reverse is R', () => {
  let box = { ...createGearbox(), gear: 2 };
  for (let i = 0; i < 60; i++) box = stepGearbox(box, GEARS[1].from - 0.2 + (i % 2) * 0.3, 0, 1 / 60);
  assert.equal(box.gear, 2, 'within the down-shift margin it holds 2nd');
  box = stepGearbox(box, -1, -1, 1 / 60);
  assert.equal(box.gear, 'R');
  assert.equal(stepGearbox(box, 0.5, 1, 1 / 60).gear, 1);
  for (const value of [NaN, Infinity, -5]) assert.ok(Number.isFinite(stepGearbox(createGearbox(), value, value, value).rpm));
});

test('tyres grip in gentle driving and slip in hard corners, hard stops and handbrake turns', () => {
  assert.equal(tyreSlip({ speed: 4, yawRate: 0.3 }), 0);
  assert.equal(tyreSlip({ speed: 0.5, yawRate: 3, handbrake: true }), 0, 'barely moving: no squeal');
  const fullLock = 9 * Math.tan(VEHICLE.maxSteerAngle) / VEHICLE.wheelbase;
  assert.ok(tyreSlip({ speed: 9, yawRate: fullLock }) > 0.9);
  assert.ok(tyreSlip({ speed: 8, yawRate: 0, acceleration: -VEHICLE.brakeDeceleration }) > 0.4);
  assert.equal(tyreSlip({ speed: 8, yawRate: 0, acceleration: -VEHICLE.coastDeceleration }), 0);
  assert.ok(tyreSlip({ speed: 7, yawRate: 0, handbrake: true }) > 0.7);
});

test('Space is the handbrake and H the horn; the handbrake slows the car and swings the tail', () => {
  const input = driveInput(new Set([' ', 'h']));
  assert.equal(input.handbrake, true);
  assert.equal(input.horn, true);
  assert.equal(driveInput(new Set(['handbrake'])).handbrake, true);
  assert.equal(driveInput(new Set(['w'])).handbrake, false);
  const moving = { x: 0, z: 0, rotation: 0, speed: 8 };
  const braked = run(moving, { throttle: 1, steer: 0, handbrake: true }, 0.5);
  assert.ok(braked.speed < 8 - VEHICLE.handbrakeDeceleration * 0.45, 'the handbrake beats the gas');
  const plain = run(moving, { throttle: 0, steer: 1 }, 0.3);
  const slide = run(moving, { throttle: 0, steer: 1, handbrake: true }, 0.3);
  assert.ok(slide.rotation > plain.rotation, 'the back steps out: it turns tighter');
  assert.equal(run({ ...moving, speed: 1 }, { throttle: 0, steer: 0, handbrake: true }, 0.5).speed, 0);
});

test('skid marks trail the rear wheels only while sliding, in a bounded pool that fades', () => {
  const marks = createSkidMarks({ maxSegments: 20, lifetime: 10 });
  let car = { x: 0, z: 0, rotation: 0, speed: 8 };
  assert.equal(marks.lay(car, 0.1, 0), 0);
  marks.lay(car, 0.9, 0);
  for (let i = 1; i <= 40; i++) { car = { ...car, z: i * 0.4 }; marks.lay(car, 0.9, i * 0.05); }
  assert.equal(marks.segments.length, 20, 'capped');
  const newest = marks.segments.reduce((a, b) => (b.born > a.born ? b : a));
  assert.ok(newest.born > 1.9, 'the oldest marks were reused, the newest kept');
  for (const segment of marks.segments) {
    assert.ok(Math.abs(segment.length - 0.4) < 1e-9);
    assert.ok(Math.abs(Math.abs(segment.x) - 0.72) < 1e-9, 'under a rear wheel');
  }
  assert.ok(marks.opacity(newest, 2) > marks.opacity(newest, 8));
  assert.equal(marks.opacity(newest, 20), 0);
  // A gap in sliding starts a fresh trail rather than bridging it.
  const before = marks.version;
  marks.lay({ ...car, z: 100 }, 0.9, 3);
  assert.equal(marks.version, before, 'a teleport lays nothing');
  marks.setCapacity(6);
  assert.equal(marks.segments.length, 6);
  assert.ok(marks.segments.every(segment => segment.born >= 1.7), 'kept the newest when shrinking');
  assert.equal(skidCapacityFor({ scale: 1, base: 1 }), SKID.maxSegments);
  assert.ok(skidCapacityFor({ scale: 2, base: 1 }) < SKID.maxSegments);
});
