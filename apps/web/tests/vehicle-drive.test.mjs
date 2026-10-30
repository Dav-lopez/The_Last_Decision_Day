import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VEHICLE, canExitVehicle, carLocalToWorld, chaseCameraAlpha, driveInput, speedKmh,
  stepVehicle, vehicleBlocked, vehicleExitPosition, vehicleForward,
} from '../src/world/vehicleDrive.mjs';
import { PARKED_CARS } from '../src/world/streetLayout.mjs';
import { isBlocked, stepPosition } from '../src/world/movement.mjs';
import { closestInteraction, transitionInteraction } from '../src/world/worldInteractions.mjs';

const parked = () => PARKED_CARS.map(car => ({ x: car.x, z: car.z, rotation: car.rotation, speed: 0 }));
const drive = (car, keys, seconds, others = []) => {
  let state = car;
  for (let t = 0; t < seconds; t += 1 / 60) state = stepVehicle(state, driveInput(new Set(keys)), 1 / 60, others);
  return state;
};
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('front of the car follows Babylon Y rotation and matches the parked fleet', () => {
  assert.ok(close(vehicleForward(0).z, 1) && close(vehicleForward(0).x, 0));
  assert.ok(close(vehicleForward(Math.PI).z, -1));
  const point = carLocalToWorld({ x: 2, z: 3, rotation: Math.PI / 2, speed: 0 }, 0, 1);
  assert.ok(close(point.x, 3) && close(point.z, 3));
  const fleet = parked();
  for (const car of fleet) assert.equal(vehicleBlocked(car, fleet.filter(other => other !== car)), false);
});

test('throttle accelerates up to the street speed limit', () => {
  const [car] = parked();
  const after1s = drive(car, ['w'], 1);
  assert.ok(after1s.speed > 4 && after1s.speed <= VEHICLE.maxForwardSpeed);
  assert.ok(after1s.z < car.z, 'car parked facing -Z moves toward the school');
  const longRun = drive({ x: -1.25, z: 9, rotation: Math.PI, speed: VEHICLE.maxForwardSpeed }, ['w'], 0.2);
  assert.ok(longRun.speed <= VEHICLE.maxForwardSpeed);
});

test('S brakes to a stop before reversing, and coasting slows the car', () => {
  const moving = { x: -1.25, z: 7.8, rotation: Math.PI, speed: 6 };
  const braking = stepVehicle(moving, { throttle: -1, steer: 0 }, 0.05);
  assert.ok(braking.speed < 6 && braking.speed >= 0);
  const stopped = drive(moving, ['s'], 0.6);
  assert.ok(stopped.speed <= 0);
  const reversing = drive({ ...moving, speed: 0 }, ['s'], 0.5);
  assert.ok(reversing.speed < 0 && reversing.speed >= -VEHICLE.maxReverseSpeed);
  assert.ok(reversing.z > moving.z, 'reverse moves backward');
  const coasting = stepVehicle(moving, { throttle: 0, steer: 0 }, 0.05);
  assert.ok(coasting.speed < moving.speed && coasting.speed > 5);
});

test('D steers right, A steers left, and a stationary car cannot spin in place', () => {
  const start = { x: 0, z: 0, rotation: 0, speed: 5 };
  const right = stepVehicle(start, { throttle: 0, steer: 1 }, 0.05);
  const left = stepVehicle(start, { throttle: 0, steer: -1 }, 0.05);
  assert.ok(right.rotation > 0 && right.x > 0);
  assert.ok(left.rotation < 0 && left.x < 0);
  const parkedCar = stepVehicle({ ...start, speed: 0 }, { throttle: 0, steer: 1 }, 0.05);
  assert.equal(parkedCar.rotation, 0);
});

test('the car stops at buildings, trees, the world edge and other cars without tunneling', () => {
  // Drive the southern car (facing +Z) at full speed: it must stop before the far edge.
  const [north, south] = parked();
  const edge = drive({ ...south, speed: VEHICLE.maxForwardSpeed }, ['w'], 4, [north]);
  assert.equal(edge.speed, 0);
  assert.equal(vehicleBlocked(edge, [north]), false);
  // Straight into the school walls.
  const school = drive({ x: 0, z: -2.5, rotation: Math.PI, speed: VEHICLE.maxForwardSpeed }, ['w'], 3);
  assert.equal(school.speed, 0);
  assert.ok(school.z > -6.75 + 1.8);
  // Rear-end a car stopped further down the same lane.
  const stoppedAhead = { x: -1.25, z: 0, rotation: Math.PI, speed: 0 };
  assert.equal(vehicleBlocked(north, [stoppedAhead]), false);
  const hit = drive({ ...north, speed: 8 }, ['w'], 2, [stoppedAhead]);
  assert.equal(hit.speed, 0);
  assert.ok(hit.z > stoppedAhead.z + 3.6, 'stopped behind the other car, not inside it');
  assert.equal(vehicleBlocked(hit, [stoppedAhead]), false);
  // A collision is reported so the HUD can explain the stop.
  assert.equal(stepVehicle({ ...hit, speed: 3 }, { throttle: 1, steer: 0 }, 0.05, [stoppedAhead]).collided, true);
});

test('invalid frames do not move the car', () => {
  const [car] = parked();
  for (const seconds of [0, -1, Number.NaN]) assert.deepEqual(stepVehicle(car, { throttle: 1, steer: 1 }, seconds), { ...car, collided: false });
  const garbage = stepVehicle(car, { throttle: Number.NaN, steer: 'x' }, 0.05);
  assert.ok(Number.isFinite(garbage.x) && Number.isFinite(garbage.rotation));
});

test('getting out requires a stopped car and a free door-side spot', () => {
  const cars = parked();
  assert.equal(canExitVehicle({ ...cars[0], speed: 3 }), false);
  assert.equal(canExitVehicle({ ...cars[0], speed: 0.2 }), true);
  const exit = vehicleExitPosition(cars[0], cars);
  assert.ok(exit);
  assert.equal(isBlocked(exit.x, exit.z, cars), false);
  // Driver door is the car's left: facing -Z, left is +X.
  assert.ok(exit.x > cars[0].x);
  // Wedged between two cars, the driver uses another free side.
  const wedged = { x: 0, z: 0, rotation: 0, speed: 0 };
  const neighbours = [wedged, { x: -2.1, z: 0, rotation: 0, speed: 0 }];
  const sideExit = vehicleExitPosition(wedged, neighbours);
  assert.ok(sideExit && sideExit.x > 0);
});

test('walking collides with a moved car, not its old parking spot', () => {
  const cars = parked();
  const moved = cars.map((car, index) => index === 0 ? { ...car, x: -6, z: 9, rotation: Math.PI / 2 } : car);
  // The old spot is now free to walk through.
  assert.equal(isBlocked(PARKED_CARS[0].x, PARKED_CARS[0].z, moved), false);
  assert.equal(isBlocked(PARKED_CARS[0].x, PARKED_CARS[0].z, cars), true);
  // The new, rotated spot blocks along the car's length (now along X).
  assert.equal(isBlocked(-6 + 1.6, 9, moved), true);
  let position = { x: -6, z: 11 };
  for (let i = 0; i < 40; i++) position = stepPosition(position, new Set(['w']), 0.05, 4, { x: 0, z: -1 }, moved);
  assert.ok(position.z > 9 + 0.78, 'stopped at the side of the moved car');
});

test('the nearest car is entered through the shared interaction rules', () => {
  const cars = parked();
  const targets = cars.map((car, index) => ({ id: `car-${index}`, type: 'vehicle', x: car.x, z: car.z }));
  const exit = vehicleExitPosition(cars[1], cars);
  const target = closestInteraction(exit, targets);
  assert.equal(target?.id, 'car-1');
  const state = transitionInteraction({ mode: 'walking', targetId: null }, target);
  assert.deepEqual(state, { mode: 'driving', targetId: 'car-1' });
});

test('chase camera sits behind the car and the HUD reports km/h', () => {
  for (const rotation of [0, Math.PI / 2, Math.PI, -2]) {
    const alpha = chaseCameraAlpha(rotation);
    const forward = vehicleForward(rotation);
    // ArcRotateCamera offset from its target is (cos a, sin a) on the ground plane.
    assert.ok(close(Math.cos(alpha), -forward.x) && close(Math.sin(alpha), -forward.z));
  }
  assert.equal(speedKmh(VEHICLE.maxForwardSpeed), 32);
  assert.equal(speedKmh(-2.5), 9);
});
