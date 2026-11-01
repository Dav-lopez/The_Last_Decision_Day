import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAREERS, NO_CAREER, joinCareer, normalizeCareer, quitCareer, rankOf, readCareer, workShift, workplaceCentre, workplaceDoors, writeCareer } from '../src/world/careers.mjs';
import { LOOKS, STYLES, normalizeLook } from '../src/world/appearance.mjs';
import { CITY_ORIGIN, createCityCollider, readCity } from '../src/world/cityLayout.mjs';

const at = (minute, day = 1, energy = 90) => ({ minute, totalMinutes: (day - 1) * 1440 + minute, energy });

test('police, soldier and firefighter careers each have ranks, pay that rises, duties and a valid uniform', () => {
  for (const job of Object.values(CAREERS)) {
    assert.equal(job.ranks.length, job.pay.length);
    for (let i = 1; i < job.pay.length; i++) assert.ok(job.pay[i] > job.pay[i - 1]);
    assert.ok(job.duties.length >= 3);
    const look = normalizeLook(job.uniform);
    for (const [part, id] of Object.entries(job.uniform)) assert.equal(look[part], id, `${job.id} ${part} ${id}`);
    assert.ok([...Object.values(LOOKS), ...Object.values(STYLES)].length);
  }
});

test('workplaces are real downtown buildings', () => {
  const city = readCity(JSON.parse(readFileSync(new URL('../public/city/boulder-pearl-street.json', import.meta.url))));
  for (const id of Object.keys(CAREERS)) assert.ok(workplaceCentre(city, id), id);
  assert.equal(workplaceCentre(city, 'astronaut'), null);
});

test('workplace doors are found from map data alone: free ground near each building', () => {
  const city = readCity(JSON.parse(readFileSync(new URL('../public/city/boulder-pearl-street.json', import.meta.url))));
  const collider = createCityCollider(city);
  const doors = workplaceDoors(city, collider);
  assert.deepEqual([...doors.keys()].sort(), Object.keys(CAREERS).sort());
  for (const [id, door] of doors) {
    const local = [door.x - CITY_ORIGIN.x, door.z - CITY_ORIGIN.z];
    assert.equal(collider.blockedLocal(local[0], local[1]), false, `${id} door is walkable`);
    const centre = workplaceCentre(city, id).local;
    assert.ok(Math.hypot(local[0] - centre[0], local[1] - centre[1]) < 60, `${id} door is near its building`);
  }
  // Deterministic, so the map pin, the taxi drop-off and the sign always agree.
  assert.deepEqual([...workplaceDoors(city, collider)], [...doors]);
  assert.equal(workplaceDoors(null, collider).size, 0);
  assert.equal(workplaceDoors(city, { blockedLocal: () => true }).size, 0);
});

test('shifts pay, cost time and need a break; three shifts earn a promotion', () => {
  let state = joinCareer(NO_CAREER, 'police');
  assert.equal(rankOf(state).title, 'Cadet');
  assert.equal(workShift(NO_CAREER, at(600)).ok, false);
  assert.match(workShift(state, at(23 * 60)).reason, /start between/);
  assert.match(workShift(state, at(600, 1, 10)).reason, /tired/);
  const first = workShift(state, at(600));
  assert.ok(first.ok && first.pay === 60 && first.hours === 4 && first.promoted === null);
  state = first.state;
  assert.match(workShift(state, at(600 + 240)).reason, /break/);
  let promoted = null;
  for (const day of [2, 3]) { const r = workShift(state, at(600, day)); assert.ok(r.ok); state = r.state; promoted ??= r.promoted; }
  assert.equal(promoted, 'Officer');
  assert.equal(rankOf(state).title, 'Officer');
  assert.equal(state.money, 180);
  assert.equal(workShift(state, at(600, 4)).pay, 95, 'paid at the new rank');
});

test('switching careers starts over but keeps savings; bad saves are cleaned', () => {
  const police = { ...joinCareer(NO_CAREER, 'police'), shifts: 7, money: 500 };
  const army = joinCareer(police, 'soldier');
  assert.deepEqual([army.career, army.shifts, army.money], ['soldier', 0, 500]);
  assert.equal(joinCareer(army, 'astronaut').career, 'soldier');
  assert.deepEqual(quitCareer(army), { career: null, shifts: 0, money: 500, lastShiftAt: null, training: { best: {}, lastPaidAt: null } });
  assert.deepEqual(normalizeCareer({ career: 'hacker', shifts: -3, money: 'lots' }), NO_CAREER);
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(writeCareer('c1', army, storage), true);
  assert.deepEqual(readCareer('c1', storage), army);
  assert.deepEqual(readCareer('c2', storage), NO_CAREER);
  assert.deepEqual(readCareer('c1', { getItem() { throw new Error('blocked'); } }), NO_CAREER);
  const maxed = { career: 'soldier', shifts: 999, money: 0, lastShiftAt: null };
  assert.deepEqual(rankOf(maxed), { index: 5, title: 'Sergeant', nextTitle: null, shiftsToNext: 0 });
});
