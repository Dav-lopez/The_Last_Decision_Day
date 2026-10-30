import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENING_START, MINUTES_PER_DAY, NEW_LIFE, SLEEPY_THRESHOLD, WAKE_MINUTE,
  advanceLife, canSleep, formatClock, isEvening, isExhausted, nearBed, normalizeLife, readLife, sleepUntilMorning, writeLife,
} from '../src/world/lifeClock.mjs';
import { BED_SIDE, homeBlocked } from '../src/world/homeInterior.mjs';

const run = (life, seconds, activity) => {
  let state = life;
  for (let t = 0; t < seconds; t += 0.5) state = advanceLife(state, 0.5, activity);
  return state;
};

test('a new life starts on day 1 at 7:00 AM, fully rested', () => {
  assert.deepEqual(NEW_LIFE, { day: 1, minute: 420, energy: 100 });
  assert.equal(formatClock(NEW_LIFE.minute), '7:00 AM');
  assert.equal(formatClock(0), '12:00 AM');
  assert.equal(formatClock(12 * 60 + 5), '12:05 PM');
  assert.equal(formatClock(23 * 60 + 59.9), '11:59 PM');
});

test('one real second is one game minute; the day rolls over at midnight', () => {
  const hour = run(NEW_LIFE, 60);
  assert.ok(Math.abs(hour.minute - 480) < 1e-6);
  const late = run({ day: 3, minute: MINUTES_PER_DAY - 1, energy: 50 }, 2);
  assert.equal(late.day, 4);
  assert.ok(Math.abs(late.minute - 1) < 1e-6);
  // A stalled tab cannot fast-forward the clock by more than a minute per frame.
  assert.ok(Math.abs(advanceLife(NEW_LIFE, 600).minute - 421) < 1e-9);
  for (const bad of [0, -5, Number.NaN]) assert.deepEqual(advanceLife(NEW_LIFE, bad), { ...NEW_LIFE });
});

test('energy drains over a waking day; running costs more and driving less', () => {
  const awake = run(NEW_LIFE, 16 * 60);
  assert.ok(awake.energy < 0.5, `awake 16 h leaves ${awake.energy}`);
  const walked = run(NEW_LIFE, 120, 'walk');
  const ran = run(NEW_LIFE, 120, 'run');
  const drove = run(NEW_LIFE, 120, 'drive');
  assert.ok(ran.energy < walked.energy && walked.energy < drove.energy);
  assert.equal(isExhausted(run(NEW_LIFE, 20 * 60)), true);
  assert.equal(run(NEW_LIFE, 20 * 60).energy, 0, 'energy never goes negative');
});

test('you can sleep when tired or in the evening, not when fresh in the daytime', () => {
  assert.deepEqual(canSleep(NEW_LIFE), { ok: false, reason: "You're not tired yet." });
  assert.equal(canSleep({ day: 1, minute: 600, energy: SLEEPY_THRESHOLD - 1 }).ok, true);
  assert.equal(canSleep({ day: 1, minute: EVENING_START, energy: 100 }).ok, true);
  assert.equal(canSleep({ day: 1, minute: 120, energy: 100 }).ok, true, 'small hours count as night');
});

test('sleeping wakes you at 7:00 the next morning, or the same morning after midnight', () => {
  const evening = sleepUntilMorning({ day: 2, minute: 23 * 60, energy: 10 });
  assert.deepEqual(evening.life, { day: 3, minute: WAKE_MINUTE, energy: 100 });
  assert.equal(evening.hoursSlept, 8);
  const nap = sleepUntilMorning({ day: 2, minute: 5 * 60, energy: 10 });
  assert.deepEqual(nap.life, { day: 2, minute: WAKE_MINUTE, energy: 35 });
  const afternoon = sleepUntilMorning({ day: 2, minute: 15 * 60, energy: 40 });
  assert.equal(afternoon.life.day, 3);
  assert.equal(afternoon.life.energy, 100);
});

test('evening runs from 7 PM to 6 AM', () => {
  assert.equal(isEvening(EVENING_START), true);
  assert.equal(isEvening(3 * 60), true);
  assert.equal(isEvening(6 * 60), false);
  assert.equal(isEvening(12 * 60), false);
});

test('the bed is used from its free side', () => {
  assert.equal(homeBlocked(BED_SIDE.x, BED_SIDE.z), false);
  assert.equal(nearBed(BED_SIDE, BED_SIDE), true);
  assert.equal(nearBed({ x: BED_SIDE.x, z: BED_SIDE.z + 3 }, BED_SIDE), false);
  assert.equal(nearBed({ x: Number.NaN, z: 0 }, BED_SIDE), false);
});

test('life is saved per character in the browser and survives bad data', () => {
  const store = new Map();
  const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  assert.deepEqual(readLife('a', storage), { ...NEW_LIFE });
  assert.equal(writeLife('a', { day: 4, minute: 900, energy: 61 }, storage), true);
  assert.deepEqual(readLife('a', storage), { day: 4, minute: 900, energy: 61 });
  assert.deepEqual(readLife('b', storage), { ...NEW_LIFE });
  store.set('tld-life-v1:a', '{not json');
  assert.deepEqual(readLife('a', storage), { ...NEW_LIFE });
  assert.deepEqual(normalizeLife({ day: -2, minute: 99999, energy: 400 }), { day: 1, minute: MINUTES_PER_DAY - 0.001, energy: 100 });
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(readLife('a', broken), { ...NEW_LIFE });
  assert.equal(writeLife('a', NEW_LIFE, broken), false);
});

test('saves send whole minutes and energy with the location', async () => {
  const { toServerLife } = await import('../src/world/lifeClock.mjs');
  assert.deepEqual(toServerLife({ day: 2, minute: 615.9, energy: 61.6 }, 'home'), { day: 2, minute: 615, energy: 62, location: 'home' });
  assert.deepEqual(toServerLife({ day: 2, minute: 1439.99, energy: 0 }, 'garage'), { day: 2, minute: 1439, energy: 0, location: 'street' });
});

test('loading continues from the furthest-along day: account or this browser', async () => {
  const { chooseStartingLife } = await import('../src/world/lifeClock.mjs');
  const browser = { day: 2, minute: 600, energy: 50 };
  const account = { day: 3, minute: 420, energy: 100, location: 'home', saved: true };
  assert.deepEqual(chooseStartingLife(browser, account), { life: { day: 3, minute: 420, energy: 100 }, location: 'home', source: 'account' });
  assert.equal(chooseStartingLife({ day: 4, minute: 0, energy: 30 }, account).source, 'browser');
  assert.equal(chooseStartingLife(browser, { ...account, saved: false }).source, 'browser', 'nothing saved on the account yet');
  assert.deepEqual(chooseStartingLife(browser, null), { life: browser, location: 'street', source: 'browser' });
});
