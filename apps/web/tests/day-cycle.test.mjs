import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY_LIGHT, dayLight, dayPhase, lightKey, mixColour } from '../src/world/dayCycle.mjs';
import { isEvening } from '../src/world/lifeClock.mjs';

const at = (h, m = 0) => h * 60 + m;

test('midday is full daylight; midnight is full night', () => {
  assert.deepEqual(dayPhase(at(12)), { golden: 0, dusk: 0, night: 0 });
  const noon = dayLight(at(12));
  assert.equal(noon.sun, DAY_LIGHT.sun.day);
  assert.equal(noon.sky, DAY_LIGHT.sky.day);
  assert.equal(noon.haze, DAY_LIGHT.haze.day);
  assert.deepEqual(dayPhase(at(23)), { golden: 1, dusk: 1, night: 1 });
  assert.equal(dayLight(at(2)).night, 1);
  assert.ok(Math.abs(dayLight(at(23)).sun - DAY_LIGHT.sun.night) < 1e-9);
});

test('evening comes on gradually: golden hour, sunset, then night', () => {
  const minutes = []; for (let m = at(15); m <= at(22); m += 5) minutes.push(m);
  const light = minutes.map(dayLight);
  for (let i = 1; i < light.length; i++) {
    assert.ok(light[i].sun <= light[i - 1].sun + 1e-9, 'the sun only fades');
    assert.ok(light[i].night >= light[i - 1].night - 1e-9);
    // No sudden jumps between 5-minute steps.
    assert.ok(Math.abs(light[i].sun - light[i - 1].sun) < 0.12, `sun step at ${minutes[i]}`);
    assert.ok(Math.abs(light[i].skyBlend - light[i - 1].skyBlend) < 0.25);
  }
  const golden = dayLight(at(17, 45));
  assert.ok(golden.golden > 0.5 && golden.dusk === 0, 'golden hour before sunset');
  const sunset = dayLight(at(19));
  assert.ok(sunset.dusk > 0.3 && sunset.dusk < 0.7 && sunset.night === 0, 'mid-sunset at 19:00');
  assert.ok(isEvening(at(19)), 'street lamps (isEvening) come on during the sunset');
});

test('morning: night lifts before six, the sun rises by half past seven', () => {
  assert.ok(dayLight(at(5, 30)).night > 0 && dayLight(at(5, 30)).night < 1);
  assert.equal(dayLight(at(6)).night, 0);
  assert.ok(dayLight(at(6, 30)).dusk > 0, 'sunrise colours');
  assert.equal(dayLight(at(8)).skyBlend, 0);
  for (let m = at(4); m < at(9); m += 5) assert.ok(dayLight(m + 5).sun >= dayLight(m).sun - 1e-9, 'brightening');
});

test('colours mix and odd input is safe', () => {
  assert.equal(mixColour('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(mixColour('#102030', '#102030', 0.7), '#102030');
  assert.deepEqual(dayLight(Number.NaN), dayLight(0));
  assert.deepEqual(dayLight(at(24, 30)), dayLight(at(0, 30)));
  assert.deepEqual(dayLight(-60), dayLight(at(23)));
  assert.equal(lightKey(at(12)), lightKey(at(13)), 'midday light does not change');
  assert.notEqual(lightKey(at(18, 40)), lightKey(at(19, 10)));
});
