import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readCity } from '../src/world/cityLayout.mjs';
import { buildOpenRoad, onOpenRoad } from '../src/world/openRoad.mjs';
import { ROAD_TRAFFIC, createRoadTraffic, laneGap, roadCarPose, roadTrafficPoses, stepRoadTraffic, trafficStretch } from '../src/world/roadTraffic.mjs';
import { SPEED_ZONES, speedZone, steerAngle, stepVehicle, VEHICLE } from '../src/world/vehicleDrive.mjs';
import { vehicleSpec } from '../src/world/vehicleSpecs.mjs';

const city = readCity(JSON.parse(readFileSync(new URL('../public/city/boulder-pearl-street.json', import.meta.url))));
const road = buildOpenRoad(city);
const run = (traffic, seconds, obstacles = [], viewers = []) => { for (let t = 0; t < seconds; t += 1 / 30) traffic = stepRoadTraffic(road, traffic, 1 / 30, obstacles, viewers); return traffic; };

test('speed zones: Maple Street unchanged, downtown quicker, the open road fast', () => {
  const top = zone => { let car = { x: 0, z: 0, rotation: 0, speed: 0 }; for (let i = 0; i < 30 * 20; i++) car = stepVehicle(car, { throttle: 1, steer: 0 }, 1 / 30, [], [], () => false, zone); return car.speed; };
  assert.equal(top(SPEED_ZONES.street), VEHICLE.maxForwardSpeed);
  assert.equal(top(undefined), VEHICLE.maxForwardSpeed, 'no zone means Maple Street');
  assert.ok(Math.abs(top(SPEED_ZONES.city) - VEHICLE.maxForwardSpeed * SPEED_ZONES.city.scale) < 1e-9);
  assert.ok(top(SPEED_ZONES.road) * 3.6 > 75, 'about 80 km/h on the open road');
  // The fire engine stays the slowest thing on the road.
  let engine = { x: 0, z: 0, rotation: 0, speed: 0, kind: 'fire-engine' };
  for (let i = 0; i < 30 * 20; i++) engine = stepVehicle(engine, { throttle: 1, steer: 0 }, 1 / 30, [], [], () => false, SPEED_ZONES.road);
  assert.ok(engine.speed < top(SPEED_ZONES.road) && Math.abs(engine.speed - vehicleSpec(engine).maxForwardSpeed * SPEED_ZONES.road.scale) < 1e-9);
  assert.equal(speedZone('nope'), SPEED_ZONES.street);
});

test('arriving in town over the limit eases you down instead of stopping dead', () => {
  let car = { x: 0, z: 0, rotation: 0, speed: VEHICLE.maxForwardSpeed * SPEED_ZONES.road.scale };
  const after = [];
  for (let i = 0; i < 30 * 4; i++) { car = stepVehicle(car, { throttle: 1, steer: 0 }, 1 / 30, [], [], () => false, SPEED_ZONES.street); after.push(car.speed); }
  assert.ok(after[0] > VEHICLE.maxForwardSpeed * 2, 'no sudden stop');
  for (let i = 1; i < after.length; i++) assert.ok(after[i] <= after[i - 1] + 1e-9);
  assert.equal(after.at(-1), VEHICLE.maxForwardSpeed, 'settles at the town limit');
});

test('steering: full lock at street speed, gentler (grip-limited) at open-road speed', () => {
  assert.equal(steerAngle(1, 5), VEHICLE.maxSteerAngle);
  assert.equal(steerAngle(-1, 8), -VEHICLE.maxSteerAngle);
  const fast = steerAngle(1, 22);
  assert.ok(fast > 0 && fast < 0.2);
  const radius = VEHICLE.wheelbase / Math.tan(fast);
  assert.ok(22 * 22 / radius <= 20 + 1e-6, 'sideways grip stays under the cap');
  for (let v = 8; v < 14; v += 0.25) assert.ok(steerAngle(1, v + 0.25) <= steerAngle(1, v) + 1e-9, 'no jump in the blend');
});

test('road traffic stays on the tarmac, in lane, and never piles into itself', () => {
  assert.ok(road, 'the open road builds');
  const { from, to } = trafficStretch(road);
  assert.ok(from >= 90 && to > from + 100);
  let traffic = createRoadTraffic(road);
  assert.equal(traffic.cars.length, ROAD_TRAFFIC.count);
  assert.deepEqual([...new Set(traffic.cars.map(car => car.dir))].sort(), [-1, 1], 'both directions');
  let moving = 0, samples = 0;
  for (let step = 0; step < 120 * 15; step++) {
    traffic = stepRoadTraffic(road, traffic, 1 / 15, [], [{ x: 0, z: -5 }]);
    if (step % 5) continue;
    const poses = roadTrafficPoses(road, traffic);
    poses.forEach((pose, i) => {
      samples++; if (pose.speed > 5) moving++;
      assert.ok(onOpenRoad(road, pose), 'on the road');
      for (let j = i + 1; j < poses.length; j++) if (traffic.cars[i].dir === traffic.cars[j].dir) assert.ok(Math.hypot(pose.x - poses[j].x, pose.z - poses[j].z) > 3.5);
    });
  }
  assert.ok(moving / samples > 0.6, `flowing (${Math.round(moving / samples * 100)}% moving)`);
  // Opposite lanes are on opposite sides of the centreline.
  const out = roadCarPose(road, { along: 150, dir: 1 }), back = roadCarPose(road, { along: 150, dir: -1 });
  assert.ok(Math.hypot(out.x - back.x, out.z - back.z) > 2);
});

test('road cars brake for you in their lane, and only reappear out of your sight (or after a wait)', () => {
  const car = { id: 0, paint: 0, dir: 1, along: 120, speed: 18, cruise: 18, parked: false };
  const ahead = roadCarPose(road, { along: 160, dir: 1 });
  let traffic = { cars: [car], random: () => 0.5 };
  traffic = run(traffic, 6, [{ x: ahead.x, z: ahead.z, radius: 1.3 }]);
  assert.ok(traffic.cars[0].speed < 0.5, 'stopped');
  assert.ok(traffic.cars[0].along < 160 - ROAD_TRAFFIC.carLength / 2, 'short of you');
  assert.equal(laneGap(road, traffic.cars[0], traffic.cars, []), Infinity, 'nothing else ahead');
  // At the far end with you standing right there: it waits rather than vanishing in front of you…
  const { to, from } = trafficStretch(road);
  const end = roadCarPose(road, { along: to, dir: 1 });
  let waiting = { cars: [{ ...car, along: to, speed: 0 }], random: () => 0.5 };
  waiting = run(waiting, 2, [], [end]);
  assert.equal(waiting.cars[0].along, to);
  // …but not forever.
  waiting = run(waiting, ROAD_TRAFFIC.maxWait, [], [end]);
  assert.ok(Math.abs(waiting.cars[0].along - to) > 20 || waiting.cars[0].along < from + 30);
});
