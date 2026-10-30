import test from 'node:test';
import assert from 'node:assert/strict';
import { KEEP_RIGHT, NEIGHBORS, PERSON_RADIUS, carAhead, isOut, personHeading, routePose, shouldYield } from '../src/world/npcLayout.mjs';
import { STATIC_SOLIDS, TREE_TRUNKS, isBlocked, isNearSchool, stepPosition } from '../src/world/movement.mjs';
import { PARKED_CARS, STREET_LIGHTS } from '../src/world/streetLayout.mjs';
import { stepVehicle, vehicleBlocked } from '../src/world/vehicleDrive.mjs';
import { LOOKS } from '../src/world/appearance.mjs';
import { movementHeading } from '../src/world/riggedPresentation.mjs';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('every neighbour has a valid look, schedule and route', () => {
  assert.ok(NEIGHBORS.length >= 5);
  assert.equal(new Set(NEIGHBORS.map(npc => npc.id)).size, NEIGHBORS.length);
  for (const npc of NEIGHBORS) {
    for (const part of ['skin', 'hair', 'outfit']) assert.ok(LOOKS[part].some(choice => choice.id === npc.look[part]), `${npc.id} ${part}`);
    assert.ok(npc.from < npc.until && npc.from >= 0 && npc.until <= 1440);
    assert.ok(npc.route.kind === 'stand' || npc.speed > 0.8 && npc.speed < 1.6, `${npc.id} walks at a human pace`);
  }
});

test('people are out in the daytime and home at night', () => {
  const out = minute => NEIGHBORS.filter(npc => isOut(npc, minute)).length;
  assert.equal(out(3 * 60), 0, 'nobody at 3 AM');
  assert.equal(out(23 * 60), 0, 'nobody at 11 PM');
  assert.ok(out(8.5 * 60) >= 5, 'busy morning with students at school');
  assert.ok(out(18 * 60) >= 3 && out(18 * 60) < out(8.5 * 60), 'quieter evening');
  assert.equal(isOut(NEIGHBORS[0], Number.NaN), false);
});

test('walkers go back and forth along their whole route and face where they walk', () => {
  const walker = NEIGHBORS.find(npc => npc.route.kind === 'segment');
  const { a, b } = walker.route;
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const at = metres => routePose(walker, metres - walker.startOffset);
  assert.ok(Math.hypot(at(0).x - a.x, at(0).z - a.z) <= KEEP_RIGHT + 1e-9, 'starts at one end');
  assert.ok(Math.hypot(at(length).x - b.x, at(length).z - b.z) <= KEEP_RIGHT + 1e-9, 'reaches the other end');
  assert.ok(close(at(2 * length).z, at(0).z), 'back at the start after a round trip');
  // Sample away from lamp posts, where walkers briefly swerve.
  const going = at(length * 0.2);
  const coming = at(length * 1.8);
  assert.ok(close(going.z, coming.z) && close(going.dz, -coming.dz), 'same spot, opposite direction');
  // Keeping right: people walking in opposite directions use opposite sides of the sidewalk.
  assert.ok(close(Math.abs(going.x - coming.x), 2 * KEEP_RIGHT), 'two lanes, so they pass each other');
  const right = going.dz * (going.x - a.x) - going.dx * (going.z - (a.z + (b.z - a.z) * 0.2));
  assert.ok(right > 0, 'the lane is on the walker’s right-hand side');
  assert.ok(close(personHeading(going.dx, going.dz), movementHeading(going.dx, going.dz)), 'same facing convention as the player');
  assert.ok(Number.isFinite(routePose(walker, Number.NaN).x));
});

test('routes stay clear of buildings, props, trees, lamp posts and parked cars', () => {
  const r = PERSON_RADIUS;
  for (const npc of NEIGHBORS) {
    for (let metres = 0; metres < 40; metres += 0.25) {
      const { x, z } = routePose(npc, metres);
      const where = `${npc.id} at ${x.toFixed(2)},${z.toFixed(2)}`;
      for (const area of STATIC_SOLIDS) {
        assert.ok(!(x + r > area.minX && x - r < area.maxX && z + r > area.minZ && z - r < area.maxZ), `${where} is inside a building or prop`);
      }
      for (const tree of TREE_TRUNKS) assert.ok(Math.hypot(x - tree.x, z - tree.z) > r + 0.21, `${where} walks into a tree`);
      // Lamp posts are thin poles; a shoulder may pass close but not through.
      for (const light of STREET_LIGHTS) assert.ok(Math.hypot(x - light.x, z - light.z) > 0.18, `${where} walks through a lamp post`);
      for (const car of PARKED_CARS) {
        const nearestX = Math.max(car.x - 0.78, Math.min(x, car.x + 0.78));
        const nearestZ = Math.max(car.z - 1.85, Math.min(z, car.z + 1.85));
        assert.ok(Math.hypot(x - nearestX, z - nearestZ) >= r - 1e-9, `${where} walks through a parked car`);
      }
      if (npc.route.kind === 'stand') break;
    }
  }
});

test('chatting students face each other and leave the school doorway free', () => {
  const [a, b] = NEIGHBORS.filter(npc => npc.route.kind === 'stand').map(npc => routePose(npc, 0));
  assert.ok(a && b);
  assert.ok(a.dx * (b.x - a.x) + a.dz * (b.z - a.z) > 0, 'A looks at B');
  assert.ok(b.dx * (a.x - b.x) + b.dz * (a.z - b.z) > 0, 'B looks at A');
  for (const pose of [a, b]) assert.equal(isNearSchool(pose), false);
  // The straight walk from the street to the school door passes beside them.
  let position = { x: 0, z: 3.8 };
  const people = [a, b].map(pose => ({ x: pose.x, z: pose.z, radius: PERSON_RADIUS }));
  for (let i = 0; i < 120; i++) position = stepPosition(position, new Set(['w']), 0.05, 4, { x: 0, z: -1 }, PARKED_CARS, people);
  assert.ok(isNearSchool(position));
});

test('walkers give way to whatever is just ahead, not behind or beside', () => {
  const pose = { x: 0, z: 0, dx: 0, dz: -1, moving: true };
  assert.equal(shouldYield(pose, [{ x: 0, z: -0.8 }]), true, 'player ahead');
  assert.equal(shouldYield(pose, [{ x: 0, z: 0.8 }]), false, 'player behind');
  assert.equal(shouldYield(pose, [{ x: 1.5, z: -0.5 }]), false, 'player well to the side');
  assert.equal(shouldYield(pose, [{ x: 0, z: -2.5 }]), false, 'far ahead');
  assert.equal(shouldYield(pose, [{ x: 0, z: -2.0, radius: 1.85 }]), true, 'a car footprint ahead');
  assert.equal(shouldYield(pose, []), false);
});

test('the player cannot walk through people, and the car stops for them', () => {
  const person = { x: 0, z: 1, radius: PERSON_RADIUS };
  assert.equal(isBlocked(0, 1.5, [], [person]), true);
  assert.equal(isBlocked(0, 2, [], [person]), false);
  let position = { x: 0, z: 3 };
  for (let i = 0; i < 40; i++) position = stepPosition(position, new Set(['w']), 0.05, 4, { x: 0, z: -1 }, [], [person]);
  assert.ok(position.z >= 1 + 0.38 + PERSON_RADIUS - 1e-6, 'stopped in front of them');
  // Driving toward someone on the road: the car stops instead of passing through.
  const car = { x: 0, z: 9, rotation: Math.PI, speed: 6 };
  const pedestrian = { x: 0, z: 4, radius: PERSON_RADIUS };
  let state = car;
  for (let i = 0; i < 120; i++) state = stepVehicle(state, { throttle: 1, steer: 0 }, 1 / 60, [], [pedestrian]);
  assert.equal(state.speed, 0);
  assert.equal(vehicleBlocked(state, [], [pedestrian]), false, 'stopped before touching them');
  assert.ok(state.z > pedestrian.z);
});

test('walkers stop for a car in their way, but not for one parked beside their path', () => {
  const crosser = NEIGHBORS.find(npc => npc.id === 'crosser');
  for (let metres = 0; metres < 12; metres += 0.2) assert.equal(carAhead(crosser, metres, PARKED_CARS), false, 'parked cars are beside the crosswalk');
  // A car stopped across the crosswalk blocks the crosser just before it.
  const blocking = [{ x: 0, z: 5.5, rotation: Math.PI / 2 }];
  const results = [];
  for (let metres = 0; metres < 5; metres += 0.1) results.push(carAhead(crosser, metres - crosser.startOffset, blocking));
  assert.ok(results.includes(true));
  const student = NEIGHBORS.find(npc => npc.route.kind === 'stand');
  assert.equal(carAhead(student, 0, blocking), false);
});

test('walkers wait at the kerb for an approaching car, but not for parked ones', async () => {
  const { carComing, inRoad } = await import('../src/world/npcLayout.mjs');
  const crosser = NEIGHBORS.find(npc => npc.id === 'crosser');
  // Find the moment the crosser is about to step off the west kerb.
  let kerb = null;
  for (let metres = -crosser.startOffset; metres < 10; metres += 0.05) {
    const here = routePose(crosser, metres), ahead = routePose(crosser, metres + 0.6);
    if (!inRoad(here) && inRoad(ahead) && here.dx > 0) { kerb = metres; break; }
  }
  assert.notEqual(kerb, null);
  const parked = PARKED_CARS.map(car => ({ ...car, speed: 0 }));
  assert.equal(carComing(crosser, kerb, parked), false);
  // A car heading south towards the crosswalk at 6 m/s, 8 m away.
  const approaching = [{ x: -1.05, z: 5.5 + 8, rotation: Math.PI, speed: 6 }];
  assert.equal(carComing(crosser, kerb, approaching), true, 'waits for the car');
  // The same car driving away is no reason to wait.
  assert.equal(carComing(crosser, kerb, [{ ...approaching[0], z: 5.5 - 4, rotation: Math.PI }]), false);
  // Already out on the road: keep going rather than freeze in front of it.
  assert.equal(carComing(crosser, kerb + 1.2, approaching), false);
});

test('someone in the road hurries across while a car is near, and jumps clear of one about to hit', async () => {
  const { crossingPace, dodgeFrom, inCarPath } = await import('../src/world/npcLayout.mjs');
  const car = { x: -1, z: 9, rotation: Math.PI, speed: 6 };
  assert.ok(crossingPace({ x: -0.5, z: 5.5 }, [car]) > 1);
  assert.equal(crossingPace({ x: -2.45, z: 5.5 }, [car]), 1, 'strolls on the sidewalk');
  assert.equal(crossingPace({ x: -0.5, z: 5.5 }, [{ ...car, speed: 0 }]), 1);
  // Standing in the lane 4 m ahead of a 6 m/s car: dodge sideways out of its path.
  const pose = { x: -0.8, z: 5 };
  const offset = dodgeFrom(pose, [car]);
  assert.ok(offset, 'finds a way out');
  assert.equal(inCarPath(pose.x + offset.x, pose.z + offset.z, [car], 1, 0.05), false);
  assert.equal(isBlocked(pose.x + offset.x, pose.z + offset.z, []), false);
  // Nothing to dodge: far away, parked, or beside the car's path.
  assert.equal(dodgeFrom({ x: -0.8, z: -6 }, [car]), null);
  assert.equal(dodgeFrom(pose, [{ ...car, speed: 0 }]), null);
  assert.equal(dodgeFrom({ x: 2.45, z: 5 }, [car]), null);
});

test('sidewalk walkers keep walking while traffic passes in the lane, but stop for a car leaving a driveway', async () => {
  const { carComing } = await import('../src/world/npcLayout.mjs');
  const walkers = NEIGHBORS.filter(npc => npc.route.kind === 'segment' && npc.id !== 'crosser');
  const lanes = [{ x: -1.05, z: 8, rotation: Math.PI, speed: 6 }, { x: 1.05, z: -4, rotation: 0, speed: 6 }];
  for (const npc of walkers) for (let metres = 0; metres < 30; metres += 0.25) {
    assert.equal(carComing(npc, metres, lanes), false, `${npc.id} does not stop for lane traffic`);
  }
  // The west driveway car pulling out towards the street at 2 m/s.
  const leaving = [{ x: -4.9, z: 0, rotation: Math.PI / 2, speed: 2 }];
  const west = walkers.find(npc => npc.route.a.x < 0);
  let stopped = false;
  for (let metres = 0; metres < 32 && !stopped; metres += 0.1) stopped = carComing(west, metres, leaving);
  assert.ok(stopped, 'someone on the west sidewalk waits for the car crossing it');
});
