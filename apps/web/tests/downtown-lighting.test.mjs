import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCityCollider, readCity, streetLampSpots } from '../src/world/cityLayout.mjs';
import { awningSpans } from '../src/world/facadeDesign.mjs';
import {
  AMBIENT, awningShadow, buildingIndex, canyonOcclusion, contactFalloff, contactShade, contactStrips, edgeNormal,
  facingNeighbour, lampPools, poolFalloff, wallBreaks, wallShade,
} from '../src/world/downtownLighting.mjs';

const CITY = new URL('../public/city/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('index.json', CITY), 'utf8'));
const city = readCity(JSON.parse(readFileSync(new URL(index.cities[0].file, CITY), 'utf8')));

test('walls darken towards the pavement and are fully lit higher up', () => {
  assert.equal(contactShade(0), AMBIENT.foot);
  assert.equal(contactShade(-1), AMBIENT.foot);
  assert.ok(Math.abs(contactShade(AMBIENT.footBand) - AMBIENT.footTop) < 1e-9);
  assert.equal(contactShade(AMBIENT.liftBand), 1);
  assert.equal(contactShade(40), 1);
  for (let y = 0; y < 14; y += 0.5) assert.ok(contactShade(y + 0.5) >= contactShade(y), `rises at ${y} m`);
});

test('a close, tall neighbour hides the sky; a far or low one barely does', () => {
  assert.equal(canyonOcclusion(0, Infinity, 30), 0, 'open street');
  assert.equal(canyonOcclusion(10, 5, 8), 0, 'above the neighbour roof line the sky is open');
  const alley = canyonOcclusion(0, 4, 20);
  const avenue = canyonOcclusion(0, 30, 20);
  assert.ok(alley > 0.8 && alley < 1, `alley ${alley.toFixed(2)}`);
  assert.ok(avenue > 0.3 && avenue < 0.4, `avenue ${avenue.toFixed(2)}`);
  assert.ok(wallShade(0, 4, 20) < wallShade(0, 30, 20));
  assert.ok(wallShade(0, 4, 20) >= AMBIENT.foot * (1 - AMBIENT.canyon), 'never black');
  assert.equal(wallShade(20, 4, 10), 1, 'upper storeys above the neighbour stay fully lit');
});

test('walls break where the shading bends, and nowhere outside the wall', () => {
  assert.deepEqual(wallBreaks(30, 18), [0, AMBIENT.footBand, AMBIENT.liftBand, 18, 30]);
  assert.deepEqual(wallBreaks(2), [0, 2]);
  assert.deepEqual(wallBreaks(8, 20), [0, AMBIENT.footBand, 8]);
  const close = wallBreaks(12.1, 12.05);
  assert.equal(close[0], 0); assert.equal(close.at(-1), 12.1);
  for (let i = 1; i < close.length; i++) assert.ok(close[i] > close[i - 1]);
});

test('edge normals point out of a counter-clockwise footprint', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.deepEqual(edgeNormal(square[0], square[1]), [0, -1]);
  assert.deepEqual(edgeNormal(square[1], square[2]), [1, -0]);
  assert.equal(edgeNormal([0, 0], [0.01, 0]), null);
});

test('a wall finds the building across the alley, with its height', () => {
  const buildings = [
    { ring: [[0, 0], [10, 0], [10, 10], [0, 10]], height: 12 },
    { ring: [[14, 0], [24, 0], [24, 10], [14, 10]], height: 25 },
  ];
  const idx = buildingIndex(buildings);
  assert.equal(idx.at(5, 5), 0);
  assert.equal(idx.at(5, 5, 0), -1, 'skips itself');
  assert.equal(idx.at(20, 3), 1);
  const east = facingNeighbour(buildings, idx, 0, [10, 0], [10, 10], [1, 0]);
  assert.ok(east.distance >= 4 && east.distance <= 4 + AMBIENT.step, `${east.distance} m`);
  assert.equal(east.height, 25);
  assert.equal(facingNeighbour(buildings, idx, 0, [0, 10], [0, 0], [-1, 0]).distance, Infinity, 'west faces open ground');
});

test('contact shadows run along every free wall and fade out over the pavement', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const strips = contactStrips(square);
  assert.equal(strips.length, 4);
  const [a, b, c, d] = strips[0];
  assert.deepEqual([a, b], [[0, 0], [10, 0]]);
  assert.deepEqual(c, [10, -AMBIENT.contactWidth]);
  assert.deepEqual(d, [0, -AMBIENT.contactWidth]);
  assert.equal(contactStrips(square, (x) => x > 10).length, 3, 'a wall against a neighbour gets none');
  assert.equal(contactFalloff(0), 1);
  assert.equal(contactFalloff(1), 0);
  assert.ok(contactFalloff(0.5) < 0.5, 'falls off quickly');
  const shade = awningShadow({ a: [0, 0], b: [4, 0], normal: [0, -1] });
  assert.ok(shade[2][1] < -1.2 && shade[3][1] < -1.2, 'reaches past the awning front');
});

test('downtown: canyons darken the alleys, and every wall gets shaded at its foot', () => {
  const idx = buildingIndex(city.buildings);
  let walls = 0; let canyons = 0; let alleys = 0;
  city.buildings.forEach((building, self) => {
    for (let i = 0; i < building.ring.length; i++) {
      const a = building.ring[i]; const b = building.ring[(i + 1) % building.ring.length];
      const n = edgeNormal(a, b);
      if (!n) continue;
      walls++;
      const facing = facingNeighbour(city.buildings, idx, self, a, b, n);
      if (facing.distance < Infinity) canyons++;
      if (facing.distance <= 6 && facing.height > 6) alleys++;
    }
  });
  assert.ok(walls > 500, `${walls} walls`);
  assert.ok(canyons > walls * 0.1 && canyons < walls * 0.9, `${canyons} of ${walls} walls face a neighbour`);
  assert.ok(alleys > 20, `${alleys} walls face a narrow alley`);
  const strips = city.buildings.flatMap(building => contactStrips(building.ring));
  assert.ok(strips.length > 500, `${strips.length} contact strips`);
  const awnings = city.buildings.flatMap(building => awningSpans(building, city.roads));
  assert.ok(awnings.every(span => awningShadow(span).length === 4));
});

test('each street lamp throws a pool of light under its head, softer where real lamp lights exist', () => {
  const spots = streetLampSpots(city, createCityCollider(city));
  const lit = lampPools(spots, true);
  const unlit = lampPools(spots, false);
  assert.equal(lit.length, spots.length);
  assert.ok(lit.every(pool => pool.strength === AMBIENT.poolLit));
  assert.ok(unlit.every(pool => pool.strength === AMBIENT.poolUnlit));
  assert.ok(AMBIENT.poolUnlit > AMBIENT.poolLit);
  for (const [i, spot] of spots.entries()) assert.ok(Math.abs(Math.hypot(lit[i].x - spot.x, lit[i].z - spot.z) - 1) < 1e-9, 'under the head, 1 m out');
  assert.equal(poolFalloff(0), 1);
  assert.equal(poolFalloff(AMBIENT.poolRadius), 0);
  assert.equal(poolFalloff(AMBIENT.poolRadius * 2), 0);
  assert.ok(poolFalloff(AMBIENT.poolRadius / 2) === 0.5);
});
