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

test('traffic lights: the two directions never have right of way at the same time', async () => {
  const { SIGNAL, signalPhase } = await import('../src/world/cityTraffic.mjs');
  const signal = { axes: [[0], [1]], offset: 3.3 };
  const cycle = 2 * (SIGNAL.green + SIGNAL.yellow + SIGNAL.allRed);
  const seen = new Set();
  for (let t = 0; t < cycle * 2; t += 0.1) {
    const [a, b] = signalPhase(signal, t);
    seen.add(`${a}/${b}`);
    assert.ok(a === 'red' || b === 'red', `both open at ${t.toFixed(1)}: ${a}/${b}`);
  }
  for (const state of ['green/red', 'yellow/red', 'red/red', 'red/green', 'red/yellow']) assert.ok(seen.has(state), state);
});

test('cars stop at a red light and go on green', async () => {
  const { buildSignals, lightFor, SIGNAL } = await import('../src/world/cityTraffic.mjs');
  const g = buildRoadGraph([
    { kind: 'primary', width: 8, points: [[-120, 0], [0, 0]] }, { kind: 'primary', width: 8, points: [[0, 0], [120, 0]] },
    { kind: 'residential', width: 8, points: [[0, -120], [0, 0]] }, { kind: 'residential', width: 8, points: [[0, 0], [0, 120]] },
  ]);
  const signals = buildSignals(g, 1);
  assert.equal(signals.size, 1);
  const west = g.edges.find(edge => edge.to === '0,0' && edge.points[0][0] < 0);
  // Find a moment when the west approach has just turned red.
  let start = 0;
  while (lightFor(signals, west.id, '0,0', start) !== 'red' || lightFor(signals, west.id, '0,0', start - 0.1) === 'red') start += 0.1;
  let traffic = { cars: [{ id: 0, paint: 0, edge: west.id, forward: true, s: west.length - 45, speed: 9 }], random: () => 0.3, signals, time: start };
  let entered = false;
  for (let t = 0; t < SIGNAL.yellow + SIGNAL.allRed + 2; t += 1 / 30) {
    traffic = stepTraffic(g, traffic, 1 / 30);
    const car = traffic.cars[0];
    if (car.edge !== west.id || west.length - car.s < TRAFFIC.junctionBox - 0.01) entered = true;
  }
  assert.equal(entered, false, 'waits at the line on red');
  assert.ok(traffic.cars[0].speed < 0.5, 'stopped');
  // Run until its light turns green: it drives on.
  for (let t = 0; t < 40 && traffic.cars[0].edge === west.id; t += 1 / 30) traffic = stepTraffic(g, traffic, 1 / 30);
  assert.notEqual(traffic.cars[0].edge, west.id, 'crossed on green');
});

test('on the real map nobody enters a junction against a red light', async () => {
  const { lightFor } = await import('../src/world/cityTraffic.mjs');
  let traffic = createTraffic(graph, 30, 4, []);
  let entries = 0, onRed = 0;
  for (let step = 0; step < 90 * 30; step++) {
    const before = traffic.cars.map(car => ({ ...car, remaining: graph.edges[car.edge].length - car.s }));
    traffic = stepTraffic(graph, traffic, 1 / 30, []);
    traffic.cars.forEach((car, i) => {
      const was = before[i];
      const now = car.edge === was.edge ? graph.edges[car.edge].length - car.s : -1;
      if (was.remaining >= TRAFFIC.junctionBox && now < TRAFFIC.junctionBox) {
        const edge = graph.edges[was.edge];
        const node = was.forward ? edge.to : edge.from;
        const light = lightFor(traffic.signals, was.edge, node, traffic.time);
        if (light) { entries++; if (light === 'red') onRed++; }
      }
    });
  }
  assert.ok(entries > 20, `cars go through lit junctions (${entries})`);
  assert.equal(onRed, 0);
});
