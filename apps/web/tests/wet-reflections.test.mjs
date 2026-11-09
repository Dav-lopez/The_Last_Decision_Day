import test from 'node:test';
import assert from 'node:assert/strict';
import { REFLECTIONS, puddleLevel, weatherAt, wetReflection } from '../src/world/weather.mjs';

test('dry and damp roads reflect nothing; soaked roads and puddles mirror the street', () => {
  assert.deepEqual(wetReflection({ wet: 0 }), { on: false, road: 0, puddle: 0 });
  assert.equal(wetReflection({ wet: REFLECTIONS.fromWet }).on, false, 'a light damp leaves no mirror');
  const soaked = wetReflection({ wet: 1, rain: 1 });
  assert.equal(soaked.on, true);
  assert.equal(soaked.road, REFLECTIONS.road);
  assert.equal(soaked.puddle, REFLECTIONS.puddle);
  assert.ok(soaked.puddle > soaked.road, 'puddles reflect more than wet asphalt');
  const half = wetReflection({ wet: 0.45 });
  assert.ok(half.road > 0 && half.road < soaked.road, 'reflections grow as the road soaks');
});

test('strengths move in steps, never above the soaked values, and stay off when the device cannot afford them', () => {
  for (let wet = 0; wet <= 1.0001; wet += 0.01) {
    const r = wetReflection({ wet });
    assert.equal(Math.round(r.road * 20), r.road * 20);
    assert.ok(r.road <= REFLECTIONS.road + 1e-9 && r.puddle <= REFLECTIONS.puddle + 1e-9);
    assert.ok(r.puddle >= r.road);
    if (puddleLevel({ wet }) > 0.05) assert.ok(r.puddle > 0);
  }
  assert.deepEqual(wetReflection({ wet: 1, rain: 1 }, false), { on: false, road: 0, puddle: 0 });
  assert.equal(wetReflection(weatherAt(2, 900, 'showers')).on, true, 'a showery afternoon soaks the roads enough to reflect');
  assert.equal(wetReflection(weatherAt(1, 600, 'clear')).on, false);
});
