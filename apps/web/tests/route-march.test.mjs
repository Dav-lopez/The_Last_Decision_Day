import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BEARING_POINTS, COMPASS, GRADES, PACES, bearingIndex, bearingOptions, callBearing, createMarch, drillStatus, markLeg, marchResult, paceFor, startLeg } from '../src/world/routeMarch.mjs';
import { finishBeat, planTask, stepTask } from '../src/world/careerTasks.mjs';
import { workplaceDoors } from '../src/world/careers.mjs';
import { CITY_ORIGIN, createCityCollider, readCity } from '../src/world/cityLayout.mjs';
import { buildRoadGraph } from '../src/world/cityTraffic.mjs';

const city = readCity(JSON.parse(readFileSync(new URL('../public/city/boulder-pearl-street.json', import.meta.url))));
const collider = createCityCollider(city);
const graph = buildRoadGraph(city.roads);
const door = (() => { const d = workplaceDoors(city, collider).get('soldier'); return { x: d.x - CITY_ORIGIN.x, z: d.z - CITY_ORIGIN.z }; })();

test('compass points: x east, z north, clockwise from north', () => {
  const o = { x: 0, z: 0 };
  assert.deepEqual([[0, 10], [10, 10], [10, 0], [10, -10], [0, -10], [-10, -10], [-10, 0], [-10, 10]].map(([x, z]) => COMPASS[bearingIndex(o, { x, z })]),
    ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
  // Rounds to the nearest point: 20° east of north is still north.
  assert.equal(COMPASS[bearingIndex(o, { x: Math.sin(0.35), z: Math.cos(0.35) })], 'N');
  assert.equal(bearingIndex(o, { x: NaN, z: 1 }), 0);
});

test('a scorecard for a real march: one leg per checkpoint, each with its own par and the bearing to the next', () => {
  const task = planTask('soldier', graph, door, { seed: 2, collider });
  const march = createMarch(task);
  assert.equal(march.legs.length, task.stops.length - 1);
  for (const [i, leg] of march.legs.entries()) {
    assert.ok(leg.par >= 8 && leg.par < 300, `leg ${i} par ${leg.par}`);
    assert.equal(leg.answer, COMPASS[bearingIndex(task.stops[i], task.stops[i + 1])]);
    assert.equal(leg.toFinal, i === march.legs.length - 1);
  }
  // The legs add up to about the whole run's par (which also has the sign-off leg and the drill allowances).
  const sum = march.legs.reduce((s, leg) => s + leg.par, 0);
  assert.ok(sum < task.par && sum > task.par * 0.5, `legs ${sum}s of par ${task.par}s`);
  assert.equal(createMarch(null), null);
  assert.equal(createMarch({ stops: [{ x: 0, z: 0, final: true }] }), null);
});

test('splits: sharp inside 85 % of par, on pace, steady, behind', () => {
  assert.deepEqual([40, 50, 60, 80].map(s => paceFor(s, 50).id), ['sharp', 'on-pace', 'steady', 'behind']);
  assert.deepEqual(PACES.map(p => p.points), [3, 2, 1, 0]);
  const march = { legs: [{ par: 50, split: null, pace: null, points: 0, answer: 'N', toFinal: false, called: null, correct: null }], legStart: 10, score: 0 };
  const marked = markLeg(march, 0, 50);
  assert.equal(marked.leg.split, 40);
  assert.equal(marked.leg.pace, 'sharp');
  assert.equal(marked.leg.title, 'Sharp');
  assert.equal(marked.march.score, 3);
  assert.equal(markLeg(marked.march, 0, 90).leg, null, 'a split is only taken once');
  assert.equal(markLeg(marked.march, 4, 90).leg, null);
});

test('the bearing call offers the right point and the two at right angles, in a fixed order', () => {
  const march = { legs: [{ answer: 'NE' }, { answer: 'S' }, { answer: 'W' }], legStart: 0, score: 0 };
  for (const [i, leg] of march.legs.entries()) {
    const options = bearingOptions(march, i);
    assert.equal(options.length, 3);
    assert.ok(options.includes(leg.answer));
    assert.equal(new Set(options).size, 3);
    assert.deepEqual(bearingOptions(march, i), options, 'stable');
  }
  assert.deepEqual([...bearingOptions(march, 0)].sort(), ['NE', 'NW', 'SE']);
  // The right answer doesn't always sit on the same key.
  const keys = [0, 1, 2].map(i => bearingOptions(march, i).indexOf(march.legs[i].answer));
  assert.ok(new Set(keys).size > 1, `answers on keys ${keys}`);
  const card = drillStatus({ legs: [{ answer: 'E', toFinal: true, split: 30, par: 40, pace: 'sharp' }] }, 0);
  assert.match(card.prompt, /Recruiting Office/);
  assert.ok(card.options.some(o => o === 'E · east'));
  assert.equal(drillStatus(null, 0), null);
});

test('calling a bearing scores it once and says what the right one was', () => {
  let march = { legs: [{ par: 50, split: 40, pace: 'sharp', points: 3, answer: 'SW', toFinal: false, called: null, correct: null }], legStart: 0, score: 3 };
  const options = bearingOptions(march, 0);
  const wrong = callBearing(march, 0, options.findIndex(o => o !== 'SW'));
  assert.equal(wrong.correct, false);
  assert.match(wrong.line, /no, it's south-west/);
  assert.equal(wrong.march.score, 3);
  const right = callBearing(march, 0, options.indexOf('SW'));
  assert.equal(right.correct, true);
  assert.equal(right.march.score, 3 + BEARING_POINTS);
  assert.equal(right.march.legs[0].points, 5);
  assert.equal(callBearing(right.march, 0, 0).line, null, 'called once');
  assert.equal(callBearing(march, 0, 7).line, null, 'out of range');
  march = startLeg(right.march, 61);
  assert.equal(march.legStart, 61);
});

test('grades: distinction from 80 %, pass from 55 %, with a pay bonus on top', () => {
  const legs = (points) => points.map(p => ({ points: p, correct: p >= 2 }));
  assert.deepEqual(GRADES.map(g => g.rate), [0.4, 0.2, 0]);
  assert.equal(marchResult({ legs: legs([5, 5, 5, 4, 4]) }).grade, 'distinction');
  assert.equal(marchResult({ legs: legs([3, 3, 3, 3, 2]) }).grade, 'pass');
  assert.equal(marchResult({ legs: legs([1, 0, 2, 1, 0]) }).grade, 'needs-work');
  const r = marchResult({ legs: legs([5, 5, 5, 5, 5]) });
  assert.equal(r.score, 25);
  assert.equal(r.max, 25);
  assert.equal(r.title, 'Distinction');
  assert.equal(marchResult(null).score, 0);
});

test('a whole march played through the duty rules and the scorecard together', () => {
  let task = planTask('soldier', graph, door, { seed: 5, collider });
  let march = createMarch(task);
  let clock = 0;
  for (let i = 0; i < task.stops.length - 1; i++) {
    // Walk the leg in 90 % of its par.
    const walk = Math.round(march.legs[i].par * 0.9);
    clock += walk;
    task = { ...task, elapsed: clock - 1 };
    let r = stepTask(task, { ...task.stops[i], seconds: 1 });
    assert.equal(r.event.beat, 'bearing');
    march = markLeg(march, r.event.index, r.task.elapsed).march;
    assert.equal(march.legs[i].pace, 'on-pace');
    const call = callBearing(march, i, bearingOptions(march, i).indexOf(march.legs[i].answer));
    assert.equal(call.correct, true);
    march = startLeg(call.march, r.task.elapsed);
    task = finishBeat(r.task).task;
  }
  const result = marchResult(march);
  assert.equal(result.score, (task.stops.length - 1) * 4);
  assert.equal(result.grade, 'distinction');
  assert.equal(result.bearings, task.stops.length - 1);
});
