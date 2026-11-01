import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRoadGraph } from '../src/world/cityTraffic.mjs';
import { formatDistance, nearestOnRoads, polylineLength, routeBetween } from '../src/world/gps.mjs';

const plus = buildRoadGraph([
  { kind: 'residential', points: [[-100, 0], [0, 0]] }, { kind: 'residential', points: [[0, 0], [100, 0]] },
  { kind: 'residential', points: [[0, -100], [0, 0]] }, { kind: 'residential', points: [[0, 0], [0, 100]] },
]);

test('snaps a point to the nearest road', () => {
  const near = nearestOnRoads(plus, 40, 3);
  assert.ok(Math.abs(near.x - 40) < 1e-9 && Math.abs(near.z) < 1e-9 && Math.abs(near.distance - 3) < 1e-9);
});

test('routes along the roads, turning at the junction', () => {
  const route = routeBetween(plus, { x: -50, z: 2 }, { x: 2, z: 60 });
  assert.ok(route);
  assert.ok(Math.abs(route.length - 110) < 1e-6, `${route.length}`);
  assert.ok(Math.abs(polylineLength(route.points) - route.length) < 1e-6);
  assert.deepEqual(route.points[0], [-50, 0]);
  assert.deepEqual(route.points.at(-1), [0, 60]);
  assert.ok(route.points.some(([x, z]) => x === 0 && z === 0), 'through the junction');
  // Same road: just the stretch between.
  const short = routeBetween(plus, { x: 10, z: 0 }, { x: 70, z: 0 });
  assert.equal(short.length, 60);
  assert.deepEqual(short.points, [[10, 0], [70, 0]]);
  // Backwards along the same road.
  assert.deepEqual(routeBetween(plus, { x: 70, z: 0 }, { x: 10, z: 0 }).points, [[70, 0], [10, 0]]);
});

test('no route when far from any road or with no roads', () => {
  assert.equal(routeBetween(plus, { x: 500, z: 500 }, { x: 0, z: 0 }), null);
  assert.equal(routeBetween(buildRoadGraph([]), { x: 0, z: 0 }, { x: 1, z: 1 }), null);
});

test('real downtown routes are continuous and no shorter than a straight line', () => {
  const data = JSON.parse(readFileSync(new URL('../public/city/boulder-pearl-street.json', import.meta.url)));
  const graph = buildRoadGraph(data.roads);
  for (const [a, b] of [[[-250, -200], [250, 200]], [[0, 0], [150, -222]], [[-300, 250], [300, -250]]]) {
    const route = routeBetween(graph, { x: a[0], z: a[1] }, { x: b[0], z: b[1] });
    assert.ok(route, `${a} → ${b}`);
    for (let i = 1; i < route.points.length; i++) {
      const gap = Math.hypot(route.points[i][0] - route.points[i - 1][0], route.points[i][1] - route.points[i - 1][1]);
      assert.ok(gap < 400, 'no jumps');
    }
    const straight = Math.hypot(route.points[0][0] - route.points.at(-1)[0], route.points[0][1] - route.points.at(-1)[1]);
    assert.ok(route.length >= straight - 1e-6);
    assert.ok(Math.abs(polylineLength(route.points) - route.length) < 0.5);
  }
});

test('distances read naturally', () => {
  assert.equal(formatDistance(4), '10 m');
  assert.equal(formatDistance(347), '350 m');
  assert.equal(formatDistance(1260), '1.3 km');
  assert.equal(formatDistance(Number.NaN), '');
});
