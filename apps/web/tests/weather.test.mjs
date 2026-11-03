import test from 'node:test';
import assert from 'node:assert/strict';
import { RAIN_DROPS, WEATHER_KINDS, dayWeather, forecastLine, rainDropCount, weatherAt, weatherLook, weatherStatus, weatherTip, wetSurface } from '../src/world/weather.mjs';
import { phoneMessages } from '../src/world/phone.mjs';

test('each day has fixed weather: day 1 clear, day 2 showers, day 3 fog, then a mix', () => {
  assert.equal(dayWeather(1).kind, 'clear');
  assert.equal(dayWeather(2).kind, 'showers');
  assert.equal(dayWeather(3).kind, 'fog');
  assert.deepEqual(dayWeather(17), dayWeather(17), 'same day, same weather');
  const counts = Object.fromEntries(WEATHER_KINDS.map(kind => [kind, 0]));
  for (let day = 4; day < 404; day++) counts[dayWeather(day).kind]++;
  for (const kind of WEATHER_KINDS) assert.ok(counts[kind] > 25, `${kind} happens (${counts[kind]})`);
  assert.ok(counts.clear > counts.showers, 'clear days outnumber rainy ones');
  // Bad input falls back to day 1.
  assert.equal(dayWeather(Number.NaN).kind, 'clear');
});

test('rain spells stay inside the day and between 10:00 and 23:00', () => {
  for (let day = 2; day < 500; day++) {
    const plan = dayWeather(day);
    if (!plan.rain) continue;
    assert.ok(plan.rain.start >= 600 && plan.rain.start <= 1200, `day ${day} starts ${plan.rain.start}`);
    assert.ok(plan.rain.end > plan.rain.start && plan.rain.end <= 1380);
    assert.ok(plan.rain.peak > 0.5 && plan.rain.peak <= 1);
  }
});

test('rain builds up, roads soak, and they dry slowly after the rain stops', () => {
  const { start, end } = dayWeather(2).rain;
  assert.equal(weatherAt(2, start - 1).rain, 0);
  assert.equal(weatherAt(2, start - 1).wet, 0);
  assert.ok(weatherAt(2, start + 5).rain < weatherAt(2, start + 30).rain, 'ramps up');
  assert.ok(weatherAt(2, start + 60).rain > 0.7);
  assert.equal(weatherAt(2, start + 60).wet, 1);
  assert.equal(weatherAt(2, end + 1).rain, 0);
  assert.ok(weatherAt(2, end + 30).wet > 0.7, 'still wet half an hour later');
  assert.ok(weatherAt(2, end + 30).wet > weatherAt(2, end + 90).wet, 'drying');
  assert.equal(weatherAt(2, end + 200).wet, 0, 'dry again');
});

test('fog is thick in the morning and lifts', () => {
  const until = dayWeather(3).fog.until;
  assert.equal(weatherAt(3, 420).fog, 1);
  assert.ok(weatherAt(3, until + 45).fog > 0.3 && weatherAt(3, until + 45).fog < 0.7);
  assert.equal(weatherAt(3, until + 120).fog, 0);
  assert.ok(weatherAt(3, until + 120).cloud < weatherAt(3, 420).cloud, 'the sky clears');
});

test('a forced kind (playtest switch) applies all day', () => {
  assert.equal(weatherAt(1, 480, 'showers').rain, 1);
  assert.equal(weatherAt(1, 480, 'fog').fog, 1);
  assert.equal(weatherAt(2, 900, 'clear').rain, 0);
  assert.equal(weatherAt(2, 900, 'nonsense').kind, 'showers', 'unknown overrides are ignored');
});

test('forecasts, tips and HUD status read naturally', () => {
  assert.equal(forecastLine(1), 'Clear skies');
  assert.equal(forecastLine(2), 'Showers 14:00–16:00');
  assert.match(forecastLine(3), /^Fog until about \d\d:\d\d, then clearing$/);
  assert.equal(weatherTip(1), null);
  assert.equal(weatherTip(2), 'Rain this afternoon, so bring an umbrella.');
  assert.match(weatherTip(3), /Foggy/);
  assert.equal(weatherStatus(weatherAt(2, 900)), 'Heavy rain');
  assert.equal(weatherStatus(weatherAt(2, 970)), 'Wet roads');
  assert.equal(weatherStatus(weatherAt(3, 420)), 'Fog');
  assert.equal(weatherStatus(weatherAt(1, 420)), 'Clear');
});

test('overcast dims the sun, pales shadows and thickens the haze', () => {
  const clear = weatherLook(weatherAt(1, 600));
  const rain = weatherLook(weatherAt(2, 900));
  const fog = weatherLook(weatherAt(3, 420));
  assert.equal(clear.sun, 1);
  assert.equal(clear.fogScale, 1);
  assert.ok(rain.sun < 0.5 && rain.sky < 1);
  assert.ok(rain.shadowDarkness > clear.shadowDarkness && rain.shadowDarkness <= 0.9);
  assert.ok(fog.fogScale > rain.fogScale && rain.fogScale > 1);
  assert.equal(fog.grey, 1);
  assert.ok(rain.sunGlow < 0.2);
});

test('rain drop budget follows the rain and the adaptive quality', () => {
  assert.equal(rainDropCount(0), 0);
  assert.equal(rainDropCount(1, { scale: 1, base: 1 }), RAIN_DROPS.max);
  const half = rainDropCount(1, { scale: 2, base: 1 });
  assert.ok(half < RAIN_DROPS.max / 2 && half >= RAIN_DROPS.min);
  assert.ok(rainDropCount(0.5) < rainDropCount(1));
});

test('wet roads are darker and glossier', () => {
  assert.deepEqual(wetSurface(0), { darken: 1, specular: 0, power: 16 });
  const wet = wetSurface(1);
  assert.ok(wet.darken < 0.75 && wet.specular > 0.5 && wet.power > 64);
});

test("Mom's morning text mentions the rain on a showers day", () => {
  const morning = day => phoneMessages({ story: null, relations: null, career: null, now: { day, minute: 480, energy: 90 } })
    .find(message => message.id === `mom:morning:${day}`);
  assert.match(morning(2).text, /Rain this afternoon, so bring an umbrella\.$/);
  assert.doesNotMatch(morning(1).text, /Rain|Fog/);
});
