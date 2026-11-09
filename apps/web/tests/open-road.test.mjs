import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CITY_ORIGIN, createCityCollider, readCity, toLocal } from '../src/world/cityLayout.mjs';
import {
  cityEdgeExcess, cityEdgeStep, findEastExit, roadHomeWaypoint,
  CITY_ENTER_MARGIN, CITY_LEAVE_MARGIN, ROAD_START, buildOpenRoad, centreDashes, findSouthEntry, insideCity, onOpenRoad,
  roadFog, roadPose, roadProgress, streetOrRoadBlocked,
} from '../src/world/openRoad.mjs';
import { TOWN_EXIT, driveInput, footprintPoints, stepVehicle, vehicleBlocked } from '../src/world/vehicleDrive.mjs';
import { DISTANT_TREES, GROUND_SIZE, HILLS, HOUSE_FOOTPRINTS } from '../src/world/surroundingsLayout.mjs';
import { PARKED_CARS } from '../src/world/streetLayout.mjs';

const city = readCity(JSON.parse(readFileSync(new URL('../public/city/boulder-pearl-street.json', import.meta.url))));
const road = buildOpenRoad(city);
const collider = createCityCollider(city);

test('the road joins Broadway at the south edge of downtown, straight north of Maple Street', () => {
  const entry = findSouthEntry(city);
  assert.equal(entry.name, 'Broadway');
  assert.ok(entry.dir.z > 0.9, 'heading into the city');
  assert.ok(Math.abs(road.entry.world.x) < 15, `downtown lines up with the exit road (x ${road.entry.world.x})`);
  // Downtown sits past Maple Street's ground and scenery, but within a short drive.
  const [, hz] = city.halfSize;
  assert.ok(CITY_ORIGIN.z - hz - 40 > GROUND_SIZE / 2, "downtown's paving starts beyond the town's grass");
  assert.ok(road.length > 250 && road.length < 450, `road length ${road.length}`);
});

test('the road starts on the exit road and ends inside the city', () => {
  assert.deepEqual({ x: road.points[0].x, z: road.points[0].z }, ROAD_START);
  assert.ok(onOpenRoad(road, { x: 0, z: TOWN_EXIT.leaveAt }));
  assert.ok(onOpenRoad(road, { x: 2, z: 60 }));
  assert.equal(onOpenRoad(road, { x: 6, z: 60 }), false, 'not across the fields');
  assert.equal(onOpenRoad(road, { x: 0, z: -15 }), false, 'south of town is not the road');
  const end = road.points.at(-1);
  assert.ok(insideCity(road, end, CITY_ENTER_MARGIN), 'the far end is inside the city');
  assert.equal(insideCity(road, roadPose(road, 0.5), CITY_LEAVE_MARGIN), false);
  // Progress grows smoothly and poses sit on the road.
  let last = -1;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const pose = roadPose(road, t);
    assert.ok(onOpenRoad(road, pose));
    const p = roadProgress(road, pose);
    assert.ok(p.t >= last - 1e-6);
    last = p.t;
  }
});

test('the road is clear: no town houses, trees or hills on it, and no downtown building across it', () => {
  for (let s = 0; s < road.length; s += 2) {
    const pose = roadPose(road, s / road.length);
    const half = roadProgress(road, pose).half;
    for (const lot of HOUSE_FOOTPRINTS) {
      assert.ok(!(pose.x > lot.minX - half && pose.x < lot.maxX + half && pose.z > lot.minZ && pose.z < lot.maxZ), `house on the road at ${s} m`);
    }
    for (const tree of DISTANT_TREES) assert.ok(Math.hypot(tree.x - pose.x, tree.z - pose.z) > half + 0.5, `tree on the road at ${s} m`);
    for (const hill of HILLS) assert.ok(Math.hypot(hill.x - pose.x, hill.z - pose.z) > hill.radius, `hill over the road at ${s} m`);
    const [lx, lz] = toLocal(pose);
    if (insideCity(road, pose, 8)) assert.equal(collider.blockedLocal(lx, lz), false, `building on the road at ${s} m`);
  }
});

test('a car steered along the road drives from Maple Street into downtown without hitting anything', () => {
  let car = { x: 0, z: TOWN_EXIT.beyond - 2.5, rotation: 0, speed: 0 };
  const others = PARKED_CARS.map(c => ({ x: c.x, z: c.z, rotation: c.rotation, speed: 0 })).filter(c => Math.hypot(c.x, c.z - 9) > 3);
  let seconds = 0;
  const step = 1 / 30;
  while (!insideCity(road, car, CITY_ENTER_MARGIN) && seconds < 120) {
    // Aim at a point 8 m ahead on the road.
    const here = roadProgress(road, car);
    const ahead = roadPose(road, Math.min(1, (here.along + 8) / road.length));
    const want = Math.atan2(ahead.x - car.x, ahead.z - car.z);
    let turn = want - car.rotation;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    const keys = new Set(['w']);
    if (turn > 0.02) keys.add('d'); else if (turn < -0.02) keys.add('a');
    const blocked = (candidate, o, p) => insideCity(road, candidate, CITY_LEAVE_MARGIN)
      ? footprintPoints(candidate).some(point => !onOpenRoad(road, point) && collider.blockedLocal(...toLocal(point)))
      : streetOrRoadBlocked(road, candidate, o, p);
    const next = stepVehicle(car, driveInput(keys), step, others, [], blocked);
    assert.equal(next.collided, false, `stuck at ${car.x.toFixed(1)}, ${car.z.toFixed(1)} after ${seconds.toFixed(1)} s`);
    car = next;
    seconds += step;
  }
  assert.ok(insideCity(road, car, CITY_ENTER_MARGIN), 'reached downtown');
  console.log(`open road drive: ${seconds.toFixed(1)} s`);
  assert.ok(seconds < 60, `the drive takes ${seconds.toFixed(0)} s`);
});

test('off the tarmac is solid out of town; Maple Street keeps its own rules', () => {
  const pose = roadPose(road, 0.6);
  assert.equal(streetOrRoadBlocked(road, { ...pose, speed: 5 }), false);
  assert.equal(streetOrRoadBlocked(road, { x: pose.x + 8, z: pose.z, rotation: pose.rotation, speed: 5 }), true);
  // In town, the same answer as the street's own collision.
  const parked = PARKED_CARS[0];
  const near = { x: parked.x, z: parked.z, rotation: parked.rotation, speed: 0 };
  assert.equal(streetOrRoadBlocked(road, near), vehicleBlocked(near));
  assert.equal(streetOrRoadBlocked(null, near), vehicleBlocked(near));
});

test('fog thins from the street haze to the city haze along the road', () => {
  const near = roadFog(road, { x: 0, z: 20 }, 0.009, 0.0032);
  const far = roadFog(road, road.points.at(-1), 0.009, 0.0032);
  assert.ok(Math.abs(near - 0.009) < 1e-6);
  assert.ok(Math.abs(far - 0.0032) < 1e-6);
  const middle = roadFog(road, roadPose(road, 0.6), 0.009, 0.0032);
  assert.ok(middle < 0.009 && middle > 0.0032);
});

test('centre dashes begin where the town road ends and stay on the road', () => {
  const dashes = centreDashes(road);
  assert.ok(dashes.length > 20);
  for (const [a, b] of dashes) { assert.ok(onOpenRoad(road, a) && onOpenRoad(road, b)); assert.ok(a.z >= 168); }
});

test('the home and the classroom (built off-map) are not on the road', async () => {
  const { HOME_ORIGIN, ROOM } = await import('../src/world/homeInterior.mjs');
  const { SCHOOL_ORIGIN, CLASSROOM } = await import('../src/world/schoolInterior.mjs');
  for (const [origin, room] of [[HOME_ORIGIN, ROOM], [SCHOOL_ORIGIN, CLASSROOM]]) {
    for (let x = -room.halfWidth - 3; x <= room.halfWidth + 3; x += 0.5) {
      for (let z = -room.halfDepth - 3; z <= room.halfDepth + 3; z += 0.5) {
        assert.equal(onOpenRoad(road, { x: origin.x + x, z: origin.z + z }), false);
      }
    }
  }
});

test('downtown\'s other edges hold the car instead of fading home, and the GPS points at the road (17e)', () => {
  const [hx, hz] = city.halfSize;
  const half = city.halfSize;
  assert.ok(cityEdgeExcess([0, 0], half) < 0, 'the centre is inside');
  const east = hx - CITY_LEAVE_MARGIN;
  // Driving east over the edge: held.
  assert.deepEqual(cityEdgeStep([east - 0.2, 0], [east + 0.3, 0], half), { atEdge: true, hold: true });
  // Already past it (dropped there), turning back in or sliding along it: free to move.
  assert.deepEqual(cityEdgeStep([east + 0.5, 0], [east + 0.2, 0], half), { atEdge: true, hold: false });
  assert.equal(cityEdgeStep([east + 0.5, 0], [east + 0.5, 3], half).hold, false);
  // Inside: nothing happens.
  assert.deepEqual(cityEdgeStep([0, 0], [1, 1], half), { atEdge: false, hold: false });
  // North and west edges too.
  assert.equal(cityEdgeStep([0, hz - CITY_LEAVE_MARGIN - 0.1], [0, hz - CITY_LEAVE_MARGIN + 0.4], half).hold, true);
  assert.equal(cityEdgeStep([-east + 0.1, 5], [-east - 0.4, 5], half).hold, true);
  const home = roadHomeWaypoint(road);
  assert.match(home.label, new RegExp(road.street));
  assert.ok(cityEdgeExcess([home.x, home.z], half) < 0, 'the waypoint is inside downtown');
  const world = { x: CITY_ORIGIN.x + home.x, z: CITY_ORIGIN.z + home.z };
  assert.ok(onOpenRoad(road, world), 'the waypoint is on the road home');
  const exit = findEastExit(city);
  assert.ok(exit && exit.dir.x > 0.7, 'a street leaves downtown to the east');
  assert.ok(Math.abs(cityEdgeExcess([exit.x, exit.z], half)) < 1e-6, 'it crosses right at the edge');
});
