import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BED_SIDE, DOOR_HALF_WIDTH, FRONT_DOORS, HOME_BLOCKERS, HOME_EXIT_DOOR, HOME_FURNITURE, HOME_ORIGIN, HOME_SPAWN, ROOM,
  atHomeExit, homeBlocked, isInsideHome, stepHomeLocomotion, streetDoorAt, streetSpawnFor, wallsToFade,
} from '../src/world/homeInterior.mjs';
import { CAMERA_PRESETS } from '../src/world/cameraControls.mjs';
import { PROP_TYPES } from '../src/world/propLayout.mjs';
import { WORLD_RADIUS, isBlocked, stepPosition } from '../src/world/movement.mjs';

const overlaps = (a, b) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
const walk = (from, keys, seconds, forward = { x: 0, z: -1 }) => {
  let position = from;
  for (let t = 0; t < seconds; t += 0.05) position = stepHomeLocomotion(position, new Set(keys), 0.05, false, forward).position;
  return position;
};

test('the home is built away from the street, outside the playable neighborhood', () => {
  assert.ok(HOME_ORIGIN.z - ROOM.halfDepth - 12 > WORLD_RADIUS);
  assert.equal(isInsideHome({ x: 0, z: 0 }), false);
  assert.equal(isInsideHome(HOME_SPAWN), true);
});

test('every piece of furniture fits inside the room without overlapping another or the doorway', () => {
  for (const site of HOME_FURNITURE) assert.ok(site.type in PROP_TYPES, `${site.type} has placement rules`);
  for (const blocker of HOME_BLOCKERS) {
    assert.ok(blocker.minX >= HOME_ORIGIN.x - ROOM.halfWidth && blocker.maxX <= HOME_ORIGIN.x + ROOM.halfWidth, `${blocker.id} inside walls (x)`);
    assert.ok(blocker.minZ >= HOME_ORIGIN.z - ROOM.halfDepth && blocker.maxZ <= HOME_ORIGIN.z + ROOM.halfDepth, `${blocker.id} inside walls (z)`);
    for (const other of HOME_BLOCKERS) if (other !== blocker) assert.ok(!overlaps(blocker, other), `${blocker.id} overlaps ${other.id}`);
  }
  const doorway = { minX: HOME_ORIGIN.x - DOOR_HALF_WIDTH + 0.08, maxX: HOME_ORIGIN.x + DOOR_HALF_WIDTH, minZ: HOME_ORIGIN.z + 1.5, maxZ: HOME_ORIGIN.z + ROOM.halfDepth };
  for (const blocker of HOME_BLOCKERS) assert.ok(!overlaps(blocker, doorway), `${blocker.id} blocks the doorway`);
});

test('the player arrives inside the door, can reach the bed and the exit, and never leaves through walls', () => {
  assert.equal(homeBlocked(HOME_SPAWN.x, HOME_SPAWN.z), false);
  assert.ok(atHomeExit(HOME_SPAWN), 'the way out is right behind the player on arrival');
  // Walk in, then across to the bedroom side (+X: screen-left for a camera looking down -Z).
  let position = walk(HOME_SPAWN, ['w'], 1.2);
  position = walk(position, ['a'], 1.85);
  position = walk(position, ['w'], 1.0);
  assert.ok(Math.hypot(position.x - BED_SIDE.x, position.z - BED_SIDE.z) < 1.0, `reached ${JSON.stringify(position)} near the bed`);
  assert.equal(homeBlocked(BED_SIDE.x, BED_SIDE.z), false);
  // Pushing into each wall for a long time stays inside the room.
  for (const keys of [['w'], ['s'], ['a'], ['d']]) {
    const end = walk({ x: HOME_ORIGIN.x, z: HOME_ORIGIN.z + 1.6 }, keys, 6);
    assert.ok(Math.abs(end.x - HOME_ORIGIN.x) < ROOM.halfWidth && Math.abs(end.z - HOME_ORIGIN.z) < ROOM.halfDepth, `${keys} stayed inside`);
  }
  assert.equal(atHomeExit({ x: HOME_ORIGIN.x, z: HOME_ORIGIN.z - 2 }), false);
});

test('furniture is solid indoors', () => {
  for (const site of HOME_FURNITURE) assert.equal(homeBlocked(site.x, site.z), true, `${site.id} is solid`);
  // Walking along the row just behind the coffee table runs into the end of the sofa.
  const sofa = HOME_BLOCKERS.find(blocker => blocker.id === 'home-sofa');
  const end = walk({ x: HOME_ORIGIN.x - 1.0, z: sofa.maxZ - 0.05 }, ['d'], 4);
  assert.ok(Math.abs(end.x - (sofa.maxX + 0.38)) < 0.2, `stopped at the sofa, not at ${end.x}`);
  const result = stepHomeLocomotion(HOME_SPAWN, new Set(['w']), 0.05, true, { x: 0, z: -1 });
  assert.equal(result.motion, 'run');
  assert.deepEqual(stepHomeLocomotion(HOME_SPAWN, new Set(['w']), Number.NaN, false).position, { x: HOME_SPAWN.x, z: HOME_SPAWN.z });
});

test('only your own front door opens; the neighbour door is recognised but locked', () => {
  const [own, neighbour] = FRONT_DOORS;
  assert.equal(own.own, true);
  assert.equal(neighbour.own, false);
  for (const door of FRONT_DOORS) {
    // The door is reachable from the street: the porch spot in front of it is free.
    const spawn = streetSpawnFor(door);
    assert.equal(isBlocked(spawn.x, spawn.z), false, `${door.id} porch is free`);
    assert.equal(streetDoorAt(spawn)?.id, door.id);
  }
  assert.equal(streetDoorAt({ x: 0, z: 3.8 }), null);
  assert.equal(streetDoorAt({ x: Number.NaN, z: 0 }), null);
  // Walking from the street start reaches your own porch.
  // With the camera looking down -Z, D walks toward -X (the left house) and W toward the houses.
  let position = { x: 0, z: 3.8 };
  for (let i = 0; i < 20; i++) position = stepPosition(position, new Set(['w']), 0.05, 3.8);
  for (let i = 0; i < 400 && position.x > own.x; i++) position = stepPosition(position, new Set(['d']), 0.05, 1);
  for (let i = 0; i < 200; i++) position = stepPosition(position, new Set(['w']), 0.05, 4);
  assert.equal(streetDoorAt(position)?.id, own.id, `ended at ${JSON.stringify(position)}`);
});

test('walls between the camera and the player fade; the indoor camera preset is valid', () => {
  assert.deepEqual(wallsToFade({ x: HOME_ORIGIN.x, z: HOME_ORIGIN.z + 9 }), ['front']);
  assert.deepEqual(wallsToFade({ x: HOME_ORIGIN.x + 9, z: HOME_ORIGIN.z + 9 }).sort(), ['front', 'right']);
  assert.deepEqual(wallsToFade({ x: HOME_ORIGIN.x - 9, z: HOME_ORIGIN.z - 2 }), ['left']);
  assert.deepEqual(wallsToFade({ x: HOME_ORIGIN.x, z: HOME_ORIGIN.z }), []);
  const indoor = CAMERA_PRESETS.indoor;
  assert.ok(indoor.minRadius <= indoor.radius && indoor.radius <= indoor.maxRadius);
  assert.ok(indoor.minBeta <= indoor.beta && indoor.beta <= indoor.maxBeta);
  // The cutaway camera starts above the 2.9-unit walls.
  assert.ok(1.25 + indoor.radius * Math.cos(indoor.beta) > ROOM.wallHeight + 2);
});

test('the indoor exit and street spawn match the room door', () => {
  assert.ok(Math.abs(HOME_EXIT_DOOR.x - HOME_ORIGIN.x) < DOOR_HALF_WIDTH);
  const spawn = streetSpawnFor(FRONT_DOORS[0]);
  assert.equal(spawn.rotation, Math.PI, 'faces the street after leaving');
});
