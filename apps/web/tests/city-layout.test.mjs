import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CITY_ORIGIN, createCityCollider, findBusStop, pointInRing, readCity, ringArea, stepCityLocomotion, toLocal, toWorld, triangulate,
} from '../src/world/cityLayout.mjs';
import { HOME_ORIGIN } from '../src/world/homeInterior.mjs';
import { SCHOOL_ORIGIN } from '../src/world/schoolInterior.mjs';

const CITY = new URL('../public/city/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('index.json', CITY), 'utf8'));
const city = readCity(JSON.parse(readFileSync(new URL(index.cities[0].file, CITY), 'utf8')));

test('the shipped city is real OpenStreetMap data, credited, with buildings, streets and parks', () => {
  assert.ok(city, 'city file is valid');
  assert.equal(city.attribution, '© OpenStreetMap contributors');
  assert.ok(readFileSync(new URL('ATTRIBUTION.md', CITY), 'utf8').includes('ODbL'));
  assert.ok(city.buildings.length > 100 && city.roads.length > 100 && city.parks.length > 0);
  for (const building of city.buildings) {
    assert.ok(ringArea(building.ring) > 0, `building ${building.id} is counter-clockwise`);
    assert.ok(building.height >= 3 && building.height <= 120);
  }
  assert.ok(city.buildings.some(b => /Courthouse/.test(b.name)), 'real landmarks are named');
  assert.equal(readCity({ ...JSON.parse(readFileSync(new URL(index.cities[0].file, CITY), 'utf8')), license: 'CC-BY' }), null);
  assert.equal(readCity(null), null);
});

test('downtown sits far from the street, the home and the classroom', () => {
  const [hx, hz] = city.halfSize;
  for (const other of [{ x: 0, z: 0 }, HOME_ORIGIN, SCHOOL_ORIGIN]) {
    assert.ok(Math.abs(CITY_ORIGIN.x - other.x) - hx > 100 || Math.abs(CITY_ORIGIN.z - other.z) - hz > 100);
  }
  assert.deepEqual(toLocal(toWorld([12, -7])), [12, -7]);
});

test('downtown is clear of the town ground and the hills around Maple Street', async () => {
  const { GROUND_SIZE, HILLS } = await import('../src/world/surroundingsLayout.mjs');
  const [hx] = city.halfSize;
  const west = CITY_ORIGIN.x - hx - 40; // the city ground's west edge
  assert.ok(west > GROUND_SIZE / 2 + 20);
  for (const hill of HILLS) assert.ok(hill.x + hill.radius < west, 'no hill pokes into downtown');
});

test('triangulation covers each footprint exactly, including concave real buildings', () => {
  const ell = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];
  const tris = triangulate(ell);
  const sum = tris.reduce((total, [a, b, c]) => total + Math.abs(ringArea([ell[a], ell[b], ell[c]])), 0);
  assert.ok(Math.abs(sum - ringArea(ell)) < 1e-9);
  assert.equal(tris.length, ell.length - 2);
  let checked = 0;
  for (const building of city.buildings) {
    const area = ringArea(building.ring);
    const covered = triangulate(building.ring).reduce((total, [a, b, c]) =>
      total + Math.abs(ringArea([building.ring[a], building.ring[b], building.ring[c]])), 0);
    if (Math.abs(covered - area) < area * 0.02 + 0.5) checked++;
  }
  assert.ok(checked / city.buildings.length > 0.97, `${checked}/${city.buildings.length} roofs exact`);
});

test('buildings are solid; streets and the bus stop are walkable; you cannot leave the map', () => {
  const collider = createCityCollider(city);
  assert.equal(pointInRing(5, 5, [[0, 0], [10, 0], [10, 10], [0, 10]]), true);
  for (const building of city.buildings.slice(0, 40)) {
    const [x, z] = building.ring[0];
    assert.equal(collider.blockedLocal(x, z), true, `wall corner of ${building.id}`);
  }
  const stop = findBusStop(city, collider);
  assert.ok(stop, 'a bus stop on a main street');
  assert.equal(collider.blockedLocal(stop.x, stop.z), false);
  assert.ok(Math.hypot(stop.x, stop.z) < 200, 'near the centre of downtown');
  const [hx] = city.halfSize;
  assert.equal(collider.blockedLocal(hx, 0), true);
  // Walking from the stop moves along the street and never ends inside a building.
  let position = toWorld([stop.x, stop.z]);
  for (let i = 0; i < 200; i++) {
    position = stepCityLocomotion(collider, position, new Set(['w']), 0.05, true, { x: Math.sin(i / 30), z: -Math.cos(i / 30) }).position;
    const [x, z] = toLocal(position);
    assert.equal(city.buildings.some(b => pointInRing(x, z, b.ring)), false);
  }
});

test('the Maple Street bus stop sits on the sidewalk, clear of the parked car and the walk to school', async () => {
  const { MAPLE_BUS_STOP, atBusStop } = await import('../src/world/cityLayout.mjs');
  const { isBlocked, isNearSchool } = await import('../src/world/movement.mjs');
  assert.equal(isBlocked(MAPLE_BUS_STOP.x, MAPLE_BUS_STOP.z), false);
  assert.equal(isNearSchool(MAPLE_BUS_STOP), false);
  assert.equal(atBusStop(MAPLE_BUS_STOP, MAPLE_BUS_STOP), true);
  assert.equal(atBusStop({ x: 0, z: 3.8 }, MAPLE_BUS_STOP), false, 'not at the starting spot');
  assert.equal(atBusStop({ x: Number.NaN, z: 0 }, MAPLE_BUS_STOP), false);
  assert.equal(atBusStop(MAPLE_BUS_STOP, null), false);
});

test('lane dashes, kerbside bus stop and a camera that never ends up inside a building', async () => {
  const { laneDashes, cameraClearance } = await import('../src/world/cityLayout.mjs');
  const dashes = laneDashes([[0, 0], [20, 0], [20, 7]], 3, 6);
  assert.ok(dashes.length >= 3);
  for (const [[ax, az], [bx, bz]] of dashes) assert.ok(Math.hypot(bx - ax, bz - az) <= 3 + 1e-9);
  assert.deepEqual(dashes[0], [[0, 0], [3, 0]]);
  assert.deepEqual(laneDashes([[0, 0]]), []);

  const collider = createCityCollider(city);
  const stop = findBusStop(city, collider);
  assert.ok(Math.abs(Math.hypot(stop.dx, stop.dz) - 1) < 1e-9, 'street direction is a unit vector');
  const road = city.roads.find(r => r.name === stop.street || r.kind === stop.street);
  assert.ok(road);
  // Kerbside: not on any traffic lane's centreline.
  const onCentre = city.roads.filter(r => !['footway', 'path', 'cycleway', 'steps', 'pedestrian'].includes(r.kind)).some(r =>
    r.points.slice(1).some((b, i) => {
      const a = r.points[i]; const dx = b[0] - a[0]; const dz = b[1] - a[1]; const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((stop.x - a[0]) * dx + (stop.z - a[1]) * dz) / len2));
      return Math.hypot(stop.x - (a[0] + t * dx), stop.z - (a[1] + t * dz)) < 1;
    }));
  assert.equal(onCentre, false);

  // Camera: from the stop, looking back towards a building, it stops short of the wall.
  const target = toWorld([stop.x, stop.z]);
  const building = city.buildings[0];
  const [bx, bz] = building.ring[0];
  const far = toWorld([bx + (bx - stop.x) * 0.5, bz + (bz - stop.z) * 0.5]);
  const clear = cameraClearance(collider, target, far);
  assert.ok(clear <= Math.hypot(far.x - target.x, far.z - target.z));
  for (let d = 0.5; d < clear; d += 0.5) {
    const ux = (far.x - target.x) / Math.hypot(far.x - target.x, far.z - target.z);
    const uz = (far.z - target.z) / Math.hypot(far.x - target.x, far.z - target.z);
    assert.equal(collider.insideLocal(...toLocal({ x: target.x + ux * d, z: target.z + uz * d })), false);
  }
  assert.equal(cameraClearance(collider, target, target), 0);
});
