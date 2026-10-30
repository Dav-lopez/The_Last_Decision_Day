import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { PROP_BLOCKERS, PROP_SITES, PROP_TYPES, propScale } from '../src/world/propLayout.mjs';
import { BUILDING_AREAS, SCHOOL_DOOR, TREE_TRUNKS, isBlocked, isNearSchool, stepPosition } from '../src/world/movement.mjs';
import { PARKED_CARS, STREET_LIGHTS } from '../src/world/streetLayout.mjs';
import { HOUSE_SITES, STREET_HALF_WIDTH } from '../src/world/suburbLayout.mjs';
import { vehicleBlocked } from '../src/world/vehicleDrive.mjs';

const MODELS = new URL('../public/models/polyhaven/', import.meta.url);
const overlaps = (a, b) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

test('props stay off buildings, the road, trees, lamps, parked cars and each other', () => {
  for (const blocker of PROP_BLOCKERS) {
    for (const building of BUILDING_AREAS) assert.ok(!overlaps(blocker, building), `${blocker.id} inside a building`);
    assert.ok(blocker.maxX < -STREET_HALF_WIDTH || blocker.minX > STREET_HALF_WIDTH, `${blocker.id} is on the road`);
    for (const point of [...TREE_TRUNKS, ...STREET_LIGHTS]) {
      assert.ok(!(point.x > blocker.minX - 0.5 && point.x < blocker.maxX + 0.5 && point.z > blocker.minZ - 0.5 && point.z < blocker.maxZ + 0.5),
        `${blocker.id} crowds a tree or lamp`);
    }
    for (const other of PROP_BLOCKERS) if (other !== blocker) assert.ok(!overlaps(blocker, other));
  }
  for (const car of PARKED_CARS) assert.equal(vehicleBlocked({ ...car, speed: 0 }), false, 'parked cars still fit');
});

test('porch plants flank each front door and benches face the street beside the school', () => {
  for (const house of HOUSE_SITES) {
    const plants = PROP_SITES.filter(site => site.type === 'plant' && Math.abs(site.x - house.x) < 3);
    assert.equal(plants.length, 2);
  }
  const benches = PROP_SITES.filter(site => site.type === 'bench');
  assert.equal(benches.length, 2);
  for (const bench of benches) {
    assert.equal(bench.rotation, 0);
    assert.equal(isNearSchool(bench), false, 'benches do not cover the school doorway');
  }
});

test('props block walking but leave the school entrance reachable from the street', () => {
  for (const site of PROP_SITES) assert.equal(isBlocked(site.x, site.z), true, `${site.id} is solid`);
  let position = { x: 0, z: 3.8 };
  for (let i = 0; i < 120; i++) position = stepPosition(position, new Set(['w']), 0.05);
  assert.ok(isNearSchool(position), `reached ${JSON.stringify(position)}, door at ${JSON.stringify(SCHOOL_DOOR)}`);
});

test('model scale matches target height without exceeding the footprint', () => {
  assert.ok(Math.abs(propScale('plant', [0.5, 0.88, 0.5]) - 1.25) < 1e-9);
  const wideBench = propScale('bench', [2.4, 0.9, 0.7]);
  assert.ok(Math.abs(wideBench * 2.4 - PROP_TYPES.bench.maxFootprint) < 1e-9);
  for (const bad of [undefined, [0, 1, 1], [1, Number.NaN, 1], [1, -1, 1]]) assert.equal(propScale('plant', bad), null);
  assert.equal(propScale('rocket', [1, 1, 1]), null);
});

test('shipped Poly Haven models, when present, are CC0, self-contained and listed with credits', { skip: !existsSync(new URL('manifest.json', MODELS)) }, () => {
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', MODELS), 'utf8'));
  assert.equal(manifest.license, 'CC0-1.0');
  const credits = readFileSync(new URL('ATTRIBUTION.md', MODELS), 'utf8');
  const slots = manifest.assets.map(asset => asset.slot);
  for (const required of ['bench', 'plant']) assert.ok(slots.includes(required), `missing required ${required}`);
  for (const slot of slots) assert.ok(slot in PROP_TYPES, `no placement rules for ${slot}`);
  for (const asset of manifest.assets) {
    assert.match(asset.file, /^[a-z_]+\.glb$/);
    assert.match(asset.page, /^https:\/\/polyhaven\.com\/a\//);
    assert.ok(credits.includes(asset.page), `${asset.id} missing from ATTRIBUTION.md`);
    const bytes = readFileSync(new URL(asset.file, MODELS));
    assert.equal(bytes.subarray(0, 4).toString(), 'glTF');
    assert.equal(statSync(new URL(asset.file, MODELS)).size, asset.bytes);
    assert.ok(asset.bytes <= 6_000_000, `${asset.file} is too large for mobile`);
    assert.ok(asset.sizeMeters.every(value => value > 0.05 && value < 6), `${asset.id} has implausible size ${asset.sizeMeters}`);
    assert.ok(propScale(asset.slot, asset.sizeMeters) > 0);
  }
});
