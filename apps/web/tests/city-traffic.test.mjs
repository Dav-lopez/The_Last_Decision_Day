import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TRAFFIC, buildRoadGraph, carPose, createTraffic, edgePoint, gapAhead, stepTraffic, trafficPoses,
} from '../src/world/cityTraffic.mjs';
import { createCityCollider, readCity } from '../src/world/cityLayout.mjs';

const data = JSON.parse(readFileSync(new URL('../public/city/boulder-pearl-street.json', import.meta.url)));
const graph = buildRoadGraph(data.roads);
const run = (traffic, seconds, obstacles = []) => { for (let t = 0; t < seconds; t += 1 / 30) traffic = stepTraffic(graph, traffic, 1 / 30, obstacles); return traffic; };

test('the real downtown streets become a connected driving network (footpaths excluded)', () => {
  assert.ok(graph.edges.length > 60, `${graph.edges.length} edges`);
  assert.ok([...graph.nodes.values()].filter(node => node.edges.length >= 3).length > 10, 'has junctions');
  assert.ok(graph.edges.every(edge => !['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'service'].includes(edge.kind)));
  assert.deepEqual(buildRoadGraph(null), { nodes: new Map(), edges: [] });
  assert.equal(buildRoadGraph([{ kind: 'footway', points: [[0, 0], [50, 0]] }]).edges.length, 0);
});

test('cars keep to the right-hand lane and face the way they drive', () => {
  // A straight road west → east: driving east, the right-hand side is -Z.
  const g = buildRoadGraph([{ kind: 'residential', width: 8, points: [[0, 0], [100, 0]] }]);
  const east = carPose(g, { edge: 0, forward: true, s: 50 });
  const west = carPose(g, { edge: 0, forward: false, s: 50 });
  assert.ok(Math.abs(east.x - 50) < 1e-9 && east.z < 0);
  assert.ok(west.z > 0, 'oncoming traffic is in the other lane');
  assert.ok(Math.abs(Math.sin(east.rotation) - 1) < 1e-9, 'rotation faces +X');
  assert.ok(Math.abs(edgePoint(g.edges[0], 0, false).x - 100) < 1e-9);
});

test('two minutes of traffic: never inside a building, never on top of each other, never gridlocked', () => {
  const collider = createCityCollider(readCity(data));
  let traffic = createTraffic(graph, 30, 11, [{ x: 0, z: 0 }]);
  let moving = 0, samples = 0;
  for (let step = 0; step < 120 * 15; step++) {
    traffic = stepTraffic(graph, traffic, 1 / 15, []);
    if (step % 15) continue;
    const poses = trafficPoses(graph, traffic);
    for (const pose of poses) {
      samples++;
      if (pose.speed > 1) moving++;
      assert.equal(collider.insideLocal(pose.x, pose.z), false, 'cars stay on the road');
    }
    for (let a = 0; a < poses.length; a++) for (let b = a + 1; b < poses.length; b++) {
      assert.ok(Math.hypot(poses[a].x - poses[b].x, poses[a].z - poses[b].z) > 1.5, 'no two cars overlap');
    }
  }
  assert.ok(moving / samples > 0.6, `traffic flows (${Math.round(moving / samples * 100)}% moving)`);
});

test('cars follow at a gap and stop for the player in the road', () => {
  const g = buildRoadGraph([{ kind: 'primary', width: 8, points: [[0, 0], [400, 0]] }]);
  let traffic = { cars: [{ id: 0, paint: 0, edge: 0, forward: true, s: 10, speed: 0 }, { id: 1, paint: 1, edge: 0, forward: true, s: 40, speed: 0 }], random: Math.random };
  // The front car is held by the player standing in its lane; the second queues behind it.
  const lead = carPose(g, traffic.cars[1]);
  const player = { x: lead.x + 12, z: lead.z, radius: 0.5 };
  for (let t = 0; t < 20; t += 1 / 30) traffic = stepTraffic(g, traffic, 1 / 30, [player]);
  const [back, front] = traffic.cars;
  assert.ok(front.speed < 0.2 && back.speed < 0.2, 'both stopped');
  const frontPose = carPose(g, front);
  assert.ok(player.x - frontPose.x > TRAFFIC.playerRadius, 'stopped short of the player');
  assert.ok(front.s - back.s >= TRAFFIC.carLength + TRAFFIC.gap * 0.8, `queued with a gap (${(front.s - back.s).toFixed(1)} m)`);
  // Player steps aside: traffic moves off again.
  for (let t = 0; t < 5; t += 1 / 30) traffic = stepTraffic(g, traffic, 1 / 30, []);
  assert.ok(traffic.cars[1].speed > 3);
  // Oncoming cars in the other lane are not "the car ahead".
  const oncoming = { id: 2, paint: 0, edge: 0, forward: false, s: 380, speed: 0 };
  assert.equal(gapAhead(g, traffic.cars[0], [traffic.cars[0], oncoming]), Infinity);
});

test('cars wait at a junction while another car is crossing it', () => {
  // A plus-shaped junction at the origin.
  const g = buildRoadGraph([
    { kind: 'residential', width: 8, points: [[-60, 0], [0, 0]] }, { kind: 'residential', width: 8, points: [[0, 0], [60, 0]] },
    { kind: 'residential', width: 8, points: [[0, -60], [0, 0]] }, { kind: 'residential', width: 8, points: [[0, 0], [0, 60]] },
  ]);
  const toCentre = id => g.edges.find(edge => edge.to === '0,0' && (id === 'west' ? edge.points[0][0] < 0 : edge.points[0][1] < 0));
  const west = toCentre('west'), south = toCentre('south');
  // One car already in the junction box from the south; one arriving from the west.
  const crossing = { id: 0, paint: 0, edge: south.id, forward: true, s: south.length - 2, speed: 0 };
  const arriving = { id: 1, paint: 1, edge: west.id, forward: true, s: west.length - 8, speed: 3 };
  let traffic = { cars: [crossing, arriving], random: () => 0.5 };
  traffic = stepTraffic(g, traffic, 0.1);
  assert.ok(traffic.cars[1].speed < 3, 'the arriving car brakes for the junction');
  assert.ok(west.length - traffic.cars[1].s >= TRAFFIC.junctionBox - 0.5, 'and stays behind the line');
});

test('dead ends and bad input never break the simulation', () => {
  const g = buildRoadGraph([{ kind: 'residential', points: [[0, 0], [30, 0]] }]);
  let traffic = createTraffic(g, 2, 3);
  for (let t = 0; t < 30; t += 0.1) traffic = stepTraffic(g, traffic, 0.1);
  assert.ok(traffic.cars.every(car => car.s >= 0 && car.s <= g.edges[car.edge].length && Number.isFinite(car.speed)));
  assert.equal(stepTraffic(g, traffic, Number.NaN), traffic);
  assert.deepEqual(createTraffic(buildRoadGraph([]), 5).cars, []);
  assert.deepEqual(run(createTraffic(graph, 3, 1), 0).cars, createTraffic(graph, 3, 1).cars, 'same seed, same traffic');
});
