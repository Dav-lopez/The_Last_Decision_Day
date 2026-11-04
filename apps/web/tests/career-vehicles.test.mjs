import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  VEHICLE_SPECS, CAREER_VEHICLES, vehicleSpec, vehicleSize, vehicleCareer, mayDrive, footprintSamples, distanceToVehicle,
  stationBay, streetDirection, sirenFrequency, beaconPhase,
} from '../src/world/vehicleSpecs.mjs';
import { VEHICLE, stepVehicle, footprintPoints, vehicleExitPosition } from '../src/world/vehicleDrive.mjs';
import { carContains } from '../src/world/movement.mjs';
import { CAR_HALF_LENGTH, CAR_HALF_WIDTH } from '../src/world/streetLayout.mjs';
import { readCity, createCityCollider, toLocal } from '../src/world/cityLayout.mjs';
import { workplaceDoors } from '../src/world/careers.mjs';
import { offTraffic } from '../src/world/downtownPeople.mjs';

const drive = (car, input, seconds) => {
  let state = car;
  for (let t = 0; t < seconds; t += 0.05) state = stepVehicle(state, input, 0.05, [], [], () => false);
  return state;
};

test('the sedan spec mirrors the family car the rest of the game already drives', () => {
  const sedan = VEHICLE_SPECS.sedan;
  for (const key of ['maxForwardSpeed', 'maxReverseSpeed', 'acceleration', 'brakeDeceleration', 'wheelbase', 'maxSteerAngle', 'handbrakeYaw']) {
    assert.equal(sedan[key], VEHICLE[key], key);
  }
  assert.deepEqual(vehicleSize({}), { halfWidth: CAR_HALF_WIDTH, halfLength: CAR_HALF_LENGTH });
  assert.equal(vehicleSpec(undefined).kind, 'sedan');
  assert.equal(vehicleSpec('nonsense').kind, 'sedan');
});

test('the cruiser is quicker than the family car and the fire engine is slower, longer and turns wider', () => {
  const start = { x: 0, z: 0, rotation: 0, speed: 0 };
  const sedan = drive(start, { throttle: 1, steer: 0 }, 2);
  const cruiser = drive({ ...start, kind: 'cruiser' }, { throttle: 1, steer: 0 }, 2);
  const engine = drive({ ...start, kind: 'fire-engine' }, { throttle: 1, steer: 0 }, 2);
  assert.ok(cruiser.speed > sedan.speed && sedan.speed > engine.speed, `${cruiser.speed} > ${sedan.speed} > ${engine.speed}`);
  assert.equal(cruiser.kind, 'cruiser', 'the vehicle kind rides along with the state');
  const top = drive({ ...start, kind: 'cruiser' }, { throttle: 1, steer: 0 }, 10);
  assert.equal(top.speed, VEHICLE_SPECS.cruiser.maxForwardSpeed);
  // Same speed, full lock: the engine's turning circle is wider (less yaw per second).
  const turn = kind => drive({ ...start, kind, speed: 6 }, { throttle: 0, steer: 1 }, 0.5).rotation;
  assert.ok(turn('fire-engine') < turn('sedan') * 0.7, 'the engine turns slowly');
  // Braking from 8 m/s takes the heavy engine further.
  const stopDistance = kind => { const end = drive({ ...start, kind, speed: 8 }, { throttle: -1, steer: 0 }, 2); return end.z; };
  assert.ok(stopDistance('fire-engine') > stopDistance('sedan') * 1.3);
});

test('footprints, collisions and door exits follow each vehicle\'s size', () => {
  const engine = { x: 0, z: 0, rotation: 0, speed: 0, kind: 'fire-engine' };
  assert.ok(carContains(engine, 0, 3.5), 'the engine is long');
  assert.ok(!carContains({ ...engine, kind: undefined }, 0, 3.5), 'a sedan is not');
  const points = footprintPoints(engine);
  assert.ok(points.length > 15, 'long vehicles sample their sides more densely');
  assert.ok(points.some(point => Math.abs(point.z - 3.9) < 1e-9));
  const exit = vehicleExitPosition(engine, [engine], () => true);
  assert.ok(exit && Math.abs(exit.x) > VEHICLE_SPECS['fire-engine'].halfWidth, 'you step out clear of the wide cab');
  assert.equal(distanceToVehicle(engine, { x: 0, z: 0 }), 0);
  assert.ok(Math.abs(distanceToVehicle(engine, { x: 0, z: 5 }) - 1.1) < 1e-9);
  assert.ok(Math.abs(distanceToVehicle({ ...engine, rotation: Math.PI / 2 }, { x: 5, z: 0 }) - 1.1) < 1e-9);
  const samples = footprintSamples(engine, 0.5);
  assert.ok(samples.every(point => Math.abs(point.x) <= 1.7 + 1e-9 && Math.abs(point.z) <= 4.4 + 1e-9));
  assert.ok(samples.some(point => Math.abs(point.x - 1.7) < 1e-9 && Math.abs(point.z - 4.4) < 1e-9), 'corners are sampled');
});

test('only the right career may take a station vehicle; family cars are anyone\'s', () => {
  assert.equal(vehicleCareer('cruiser'), 'police');
  assert.equal(vehicleCareer('fire-engine'), 'firefighter');
  assert.equal(vehicleCareer('sedan'), null);
  assert.equal(CAREER_VEHICLES.police.kind, 'cruiser');
  assert.ok(mayDrive('cruiser', 'police').ok);
  assert.ok(mayDrive('fire-engine', 'firefighter').ok);
  assert.ok(mayDrive('sedan', null).ok);
  const refused = mayDrive('fire-engine', 'police');
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /fire engine is for firefighters/);
  assert.match(mayDrive('cruiser', null).reason, /police station/);
});

test('a station bay keeps the whole vehicle clear of walls and off the door', () => {
  // A wall along z = 6 and the door at the origin; only the open side (z < 6) is free.
  // A 6 m deep forecourt between a wall (z = 6) and the street (z = 0): too shallow to park the engine nose-in.
  const isFree = (x, z) => z < 6 && Math.abs(x) < 30 && z > 0;
  const door = { x: 0, z: 5 };
  const bay = stationBay(door, 'fire-engine', isFree, { along: { x: 1, z: 0 } });
  assert.ok(bay);
  const placed = { ...bay, kind: 'fire-engine' };
  assert.ok(footprintSamples(placed, 0.45).every(point => isFree(point.x, point.z)));
  assert.ok(distanceToVehicle(placed, door) >= 3.4, 'the door prompt and the get-in reach never overlap');
  assert.ok(Math.abs(Math.sin(bay.rotation)) > 0.99, 'parked along the street');
  assert.equal(stationBay(door, 'cruiser', () => false), null);
  assert.equal(stationBay(null, 'cruiser', isFree), null);
});

test('street direction comes from the nearest road segment', () => {
  const roads = [{ points: [[0, 0], [10, 0]] }, { points: [[0, 20], [0, 40]] }];
  assert.deepEqual(streetDirection(roads, { x: 5, z: 2 }), { x: 1, z: 0 });
  assert.deepEqual(streetDirection(roads, { x: 1, z: 30 }), { x: 0, z: 1 });
  assert.equal(streetDirection([], { x: 0, z: 0 }), null);
});

test('both station vehicles find a bay outside their real downtown stations', () => {
  const CITY = new URL('../public/city/', import.meta.url);
  const index = JSON.parse(readFileSync(new URL('index.json', CITY), 'utf8'));
  const city = readCity(JSON.parse(readFileSync(new URL(index.cities[0].file, CITY), 'utf8')));
  const collider = createCityCollider(city);
  const doors = workplaceDoors(city, collider);
  const isFree = (x, z) => { const [lx, lz] = toLocal({ x, z }); return !collider.blockedLocal(lx, lz) && offTraffic(city.roads, lx, lz, 0.3); };
  for (const [career, entry] of Object.entries(CAREER_VEHICLES)) {
    const door = doors.get(career);
    assert.ok(door, `${career} door`);
    const bay = stationBay(door, entry.kind, isFree);
    assert.ok(bay, `${entry.kind} bay`);
    assert.ok(Math.hypot(bay.x - door.x, bay.z - door.z) < 25, `${entry.kind} parks near the door`);
    assert.ok(distanceToVehicle({ ...bay, kind: entry.kind }, door) >= 3.4, `${entry.kind} leaves the door clear`);
  }
});

test('sirens sweep in their own ranges and the beacons alternate', () => {
  for (let t = 0; t < 10; t += 0.07) {
    const wail = sirenFrequency('wail', t);
    assert.ok(wail >= 650 && wail <= 1350);
    const growl = sirenFrequency('growl', t);
    assert.ok(growl >= 290 && growl <= 1065, `${growl} at ${t}`);
  }
  assert.equal(sirenFrequency('wail', 0), 650);
  assert.equal(Math.round(sirenFrequency('wail', 1.2)), 1350);
  assert.ok(sirenFrequency('growl', 0) < 310, 'the mechanical siren winds up from low');
  assert.ok(sirenFrequency('growl', 3) > 600);
  assert.equal(sirenFrequency(null, 1), null);
  const cruiser = [0, 0.2].map(t => beaconPhase('cruiser', t));
  assert.ok(cruiser[0].left && !cruiser[0].right && cruiser[1].right && !cruiser[1].left);
  const engine = Array.from({ length: 8 }, (_, i) => beaconPhase('fire-engine', i * 0.1 + 0.05));
  assert.equal(engine.filter(phase => phase.left).length, 2);
  assert.equal(engine.filter(phase => phase.right).length, 2);
  assert.equal(engine.filter(phase => phase.white).length, 2);
  assert.ok(engine.every(phase => !(phase.left && phase.right)));
});
