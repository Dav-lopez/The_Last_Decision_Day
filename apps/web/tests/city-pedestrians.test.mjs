import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRoadGraph, buildSignals, createTraffic, lightFor, stepTraffic, TRAFFIC } from '../src/world/cityTraffic.mjs';
import { WALK, createPedestrians, pavementOffsets, pedestrianPose, pedestrianPoses, stepPedestrians } from '../src/world/cityPedestrians.mjs';
import { createCityCollider, readCity } from '../src/world/cityLayout.mjs';

const data = JSON.parse(readFileSync(new URL('../public/city/boulder-pearl-street.json', import.meta.url)));
const city = readCity(data);
const collider = createCityCollider(city);
const graph = buildRoadGraph(city.roads);
const offsets = pavementOffsets(graph, collider.insideLocal);

test('pavements run beside the road, clear of buildings', () => {
  assert.ok(offsets.filter(o => o !== null).length > graph.edges.length * 0.8);
  for (const [i, offset] of offsets.entries()) if (offset !== null) assert.ok(offset > graph.edges[i].lane * 2, 'outside the traffic lanes');
  const blocked = pavementOffsets(buildRoadGraph([{ kind: 'residential', points: [[0, 0], [50, 0]] }]), () => true);
  assert.deepEqual(blocked, [null], 'no room, no pavement');
});

test('two minutes downtown: always on the pavement or a crossing, never in a building, no teleports in view', () => {
  let traffic = createTraffic(graph, 28, 4, []);
  const focus = [{ x: 0, z: 0 }];
  let crowd = createPedestrians(graph, offsets, 24, 9, focus);
  assert.equal(crowd.people.length, 24);
  let last = pedestrianPoses(graph, offsets, crowd), waited = 0, crossed = 0;
  for (let step = 0; step < 120 * 15; step++) {
    traffic = stepTraffic(graph, traffic, 1 / 15, []);
    crowd = stepPedestrians(graph, offsets, crowd, 1 / 15, { signals: traffic.signals, time: traffic.time, focus });
    const poses = pedestrianPoses(graph, offsets, crowd);
    poses.forEach((pose, i) => {
      assert.equal(collider.insideLocal(pose.x, pose.z), false);
      const jump = Math.hypot(pose.x - last[i].x, pose.z - last[i].z);
      // Walkers only reappear (a dead end) well away from the player.
      if (jump > 1) assert.ok(Math.hypot(pose.x - focus[0].x, pose.z - focus[0].z) >= WALK.respawnClear, `jumped ${jump.toFixed(1)} m in view`);
      if (pose.waiting) waited++;
      if (pose.crossing) crossed++;
    });
    last = poses;
  }
  assert.ok(waited > 0, 'people wait at the lights');
  assert.ok(crossed > 0, 'people cross streets');
});

test('walkers wait at a red light and cross when their traffic has green', () => {
  const g = buildRoadGraph([
    { kind: 'primary', width: 8, points: [[-80, 0], [0, 0]] }, { kind: 'primary', width: 8, points: [[0, 0], [80, 0]] },
    { kind: 'residential', width: 8, points: [[0, -80], [0, 0]] }, { kind: 'residential', width: 8, points: [[0, 0], [0, 80]] },
  ]);
  const off = pavementOffsets(g);
  const signals = buildSignals(g, 1);
  const west = g.edges.find(edge => edge.to === '0,0' && edge.points[0][0] < 0);
  let time = 0;
  while (lightFor(signals, west.id, '0,0', time) !== 'red') time += 0.1;
  let crowd = { people: [{ id: 0, look: 0, edge: west.id, forward: true, s: west.length - 6, side: 1, pace: 1.3, waiting: false, crossing: null }], random: () => 0.1 };
  let sawWait = false;
  for (let t = 0; t < 30; t += 0.1) {
    const light = lightFor(signals, west.id, '0,0', time);
    crowd = stepPedestrians(g, off, crowd, 0.1, { signals, time });
    time += 0.1;
    const person = crowd.people[0];
    if (person.waiting) { sawWait = true; assert.notEqual(light, 'green'); }
    if (person.edge !== west.id || person.crossing) { assert.ok(sawWait, 'waited first'); assert.equal(light, 'green', 'left the kerb on green'); return; }
  }
  assert.fail('never crossed');
});

test('cars stop for someone crossing in front of them', () => {
  const g = buildRoadGraph([{ kind: 'primary', width: 8, points: [[0, 0], [300, 0]] }]);
  let traffic = { cars: [{ id: 0, paint: 0, edge: 0, forward: true, s: 10, speed: 9 }], random: () => 0.5 };
  // A walker standing in the car's lane 30 m ahead.
  const lane = -g.edges[0].lane;
  for (let t = 0; t < 8; t += 1 / 30) traffic = stepTraffic(g, traffic, 1 / 30, [{ x: 40, z: lane, radius: WALK.radius }]);
  assert.ok(traffic.cars[0].speed < 0.3);
  assert.ok(40 - traffic.cars[0].s > TRAFFIC.carLength / 2, 'stopped short');
  assert.ok(pedestrianPose(g, [5], { edge: 0, forward: true, s: 5, side: 1, crossing: null }).z < -4, 'right-hand pavement is beside the road');
});
