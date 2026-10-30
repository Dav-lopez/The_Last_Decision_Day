import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISTANT_HOUSES, DISTANT_TREES, FENCES, GROUND_SIZE, HILLS, HOUSE_FOOTPRINTS, PLAYABLE_HALF, ROAD_BARRICADE, ROAD_HALF, ROAD_REACH,
  SIDEWALK_CENTER, SIDEWALK_WIDTH,
} from '../src/world/surroundingsLayout.mjs';
import { WORLD_RADIUS } from '../src/world/movement.mjs';

const overlaps = (a, b) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
const sidewalkOuter = SIDEWALK_CENTER + SIDEWALK_WIDTH / 2;

test('the ground and road reach far enough for fog to hide the edge', () => {
  assert.ok(GROUND_SIZE / 2 > ROAD_REACH + 20);
  assert.ok(ROAD_REACH > 150, 'fog (EXP2, 0.009) has nearly fully faded the scene by ~170 m');
  for (const hill of HILLS) assert.ok(Math.hypot(hill.x, hill.z) + hill.radius < GROUND_SIZE / 2 + hill.radius && Math.hypot(hill.x, hill.z) > 150);
});

test('distant houses line the road outside the playable square, facing it, without overlapping', () => {
  assert.ok(DISTANT_HOUSES.length >= 30);
  for (const [i, lot] of HOUSE_FOOTPRINTS.entries()) {
    const house = DISTANT_HOUSES[i];
    assert.ok(Math.abs(house.z) > PLAYABLE_HALF + house.width / 2, 'outside the playable square');
    assert.ok(lot.minX > sidewalkOuter + 1 || lot.maxX < -sidewalkOuter - 1, 'set back from the sidewalk');
    // Facing the road: the house front (+Z at rotation 0) turned toward x = 0.
    const frontX = Math.sin(house.rotation);
    assert.ok(Math.sign(frontX) === -Math.sign(house.x), 'front faces the road');
    for (const [j, other] of HOUSE_FOOTPRINTS.entries()) if (i !== j) assert.ok(!overlaps(lot, other), 'lots do not overlap');
  }
});

test('trees stay off the road, the lots and the playable square; the town is the same for everyone', async () => {
  assert.ok(DISTANT_TREES.length >= 200);
  for (const tree of DISTANT_TREES) {
    assert.ok(Math.abs(tree.x) > sidewalkOuter + 2, 'off the road and sidewalks');
    assert.ok(!(Math.abs(tree.x) < PLAYABLE_HALF && Math.abs(tree.z) < PLAYABLE_HALF), 'outside the playable square');
    for (const lot of HOUSE_FOOTPRINTS) assert.ok(!(tree.x > lot.minX && tree.x < lot.maxX && tree.z > lot.minZ && tree.z < lot.maxZ), 'not inside a house');
  }
  const again = await import('../src/world/surroundingsLayout.mjs?again');
  assert.deepEqual(again.DISTANT_TREES, DISTANT_TREES, 'deterministic');
});

test('fences and a road barricade mark the playable edge just outside where the player can walk', () => {
  assert.ok(ROAD_BARRICADE.z > WORLD_RADIUS - 0.4 && ROAD_BARRICADE.z < PLAYABLE_HALF);
  assert.ok(ROAD_BARRICADE.halfWidth >= sidewalkOuter, 'spans the road and both sidewalks');
  for (const fence of FENCES) {
    for (const point of [fence.from, fence.to]) assert.ok(Math.max(Math.abs(point.x), Math.abs(point.z)) > WORLD_RADIUS - 0.4, 'on the edge');
    const alongRoad = fence.from.z === fence.to.z && Math.min(Math.abs(fence.from.x), Math.abs(fence.to.x)) < ROAD_HALF;
    assert.equal(alongRoad, false, 'no fence across the road itself');
  }
});
