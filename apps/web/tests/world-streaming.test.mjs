import test from 'node:test';
import assert from 'node:assert/strict';
import { STREAMING, cityRect, rectDistance, streamVisibility } from '../src/world/worldStreaming.mjs';
import { CITY_ORIGIN } from '../src/world/cityLayout.mjs';

const city = cityRect([340.6, 289.1]);

test('distance to a rectangle is zero inside and flat outside', () => {
  const rect = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
  assert.equal(rectDistance(rect, { x: 5, z: 5 }), 0);
  assert.equal(rectDistance(rect, { x: 13, z: 5 }), 3);
  assert.equal(rectDistance(rect, { x: 13, z: 14 }), 5);
  assert.ok(city.minZ < CITY_ORIGIN.z && city.maxZ > CITY_ORIGIN.z);
  assert.equal(city.maxX - city.minX, (340.6 + STREAMING.cityMargin) * 2);
});

test('on Maple Street downtown is not drawn; downtown, Maple Street is not drawn', () => {
  const both = { town: true, city: true };
  assert.deepEqual(streamVisibility(both, { x: 0, z: 9.9 }, city, 'street'), { town: true, city: false }, 'at the Maple Street bus stop');
  assert.deepEqual(streamVisibility(both, { x: 0, z: -110 }, city, 'home'), { town: true, city: false }, 'indoors at home');
  assert.deepEqual(streamVisibility(both, { x: CITY_ORIGIN.x, z: CITY_ORIGIN.z }, city, 'city'), { town: false, city: true }, 'downtown');
  assert.deepEqual(streamVisibility(both, { x: -40, z: city.minZ + 20 }, city, 'city'), { town: false, city: true }, 'just inside downtown');
});

test('driving the road shows the place ahead before you get there, and never flickers at the edge', () => {
  // Heading north from Maple Street.
  let shown = { town: true, city: false };
  const appeared = [];
  for (let z = 0; z <= city.minZ + 30; z += 2) {
    const next = streamVisibility(shown, { x: -10, z }, city, z < city.minZ + 20 ? 'street' : 'city');
    if (next.city && !shown.city) appeared.push(z);
    shown = next;
    assert.ok(shown.town || shown.city, 'something is always drawn');
  }
  assert.equal(appeared.length, 1);
  assert.ok(city.minZ - appeared[0] >= STREAMING.showWithin - 2, `downtown appears ${city.minZ - appeared[0]} m before you reach it`);
  assert.equal(shown.town, false, 'Maple Street is gone once you are downtown');
  // Wobbling around the threshold doesn't toggle it.
  const edge = city.minZ - STREAMING.showWithin - 1;
  let wobble = { town: true, city: true };
  for (const z of [edge, edge - 10, edge, edge - 20, edge]) {
    wobble = streamVisibility(wobble, { x: -10, z }, city, 'street');
    assert.equal(wobble.city, true, 'stays shown inside the hide distance');
  }
});

test('before downtown is built only Maple Street is drawn, and somewhere in between keeps what it had', () => {
  assert.deepEqual(streamVisibility(null, { x: 0, z: 0 }, null, 'street'), { town: true, city: false });
  const far = { x: 900, z: -900 };
  assert.deepEqual(streamVisibility({ town: false, city: true }, far, city, 'road'), { town: false, city: true });
});

test('downtown is freed after a minute out of sight, and never while it is needed', async () => {
  const { UNLOAD, stepUnload } = await import('../src/world/worldStreaming.mjs');
  let timer = 0; let freedAt = null;
  for (let t = 0; t < 120; t += 0.5) {
    const step = stepUnload(timer, { loaded: true, shown: false, busy: false, seconds: 0.5 });
    timer = step.timer;
    if (step.unload) { freedAt = t + 0.5; break; }
  }
  assert.equal(freedAt, UNLOAD.afterSeconds);
  // Seeing it, being busy (a duty, a match, a ride) or it not being built all reset the clock.
  for (const blocker of [{ shown: true }, { busy: true }, { loaded: false }]) {
    const step = stepUnload(UNLOAD.afterSeconds - 1, { loaded: true, shown: false, busy: false, seconds: 5, ...blocker });
    assert.deepEqual(step, { timer: 0, unload: false });
  }
  // A long frame (a stall, a backgrounded tab) counts as at most a second.
  assert.equal(stepUnload(0, { loaded: true, shown: false, busy: false, seconds: 30 }).timer, 1);
});
