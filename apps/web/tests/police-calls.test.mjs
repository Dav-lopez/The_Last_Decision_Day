import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planTask, stepTask } from '../src/world/careerTasks.mjs';
import { workplaceDoors } from '../src/world/careers.mjs';
import { CITY_ORIGIN, createCityCollider, readCity } from '../src/world/cityLayout.mjs';
import { buildRoadGraph } from '../src/world/cityTraffic.mjs';
import {
  CALLS, CALL_ORDER, CALL_SECONDS, CONDUCT, FOLLOW_GAP, callFor, callResult, callStatus, callTarget, chooseCall, holdsTask,
  nearestStreet, planCall, resolveCall, stepCall, stepFollower,
} from '../src/world/policeCalls.mjs';

const city = readCity(JSON.parse(readFileSync(new URL('../public/city/boulder-pearl-street.json', import.meta.url))));
const collider = createCityCollider(city);
const graph = buildRoadGraph(city.roads);
const doors = workplaceDoors(city, collider);
const door = (() => { const d = doors.get('police'); return { x: d.x - CITY_ORIGIN.x, z: d.z - CITY_ORIGIN.z }; })();
const patrol = (seed = 2) => planTask('police', graph, door, { seed, collider });

test('three everyday calls, each with a kind, a firm and a poor answer, and nothing violent', () => {
  assert.deepEqual([...CALL_ORDER].sort(), Object.keys(CALLS).sort());
  for (const spec of Object.values(CALLS)) {
    assert.deepEqual(spec.options.map(o => o.tone), ['best', 'ok', 'poor'], spec.id);
    const lines = [spec.dispatch, spec.arrive, spec.escort ?? '', spec.resolved ?? '', ...spec.options.flatMap(o => [o.text, o.reply])];
    for (const line of lines) assert.doesNotMatch(line, /gun|shoot|arrest|weapon|chase|handcuff|taser|fight/i, line);
  }
  assert.ok(CONDUCT.best.share > CONDUCT.ok.share && CONDUCT.ok.share > CONDUCT.poor.share);
});

test('calls come in turn, so three patrols in a row see all three', () => {
  assert.deepEqual([1, 2, 3, 4].map(callFor), ['lost-child', 'traffic-stop', 'noise-complaint', 'lost-child']);
  assert.equal(callFor(0), 'noise-complaint');
  assert.equal(callFor(NaN), 'lost-child');
});

test('a call is planned on the patrol\'s second stop and adds its time to par; other careers get none', () => {
  const task = patrol();
  for (const kind of CALL_ORDER) {
    const planned = planCall(task, kind, graph);
    assert.ok(planned, kind);
    assert.equal(planned.call.stop, 1);
    assert.equal(planned.task.stops[1].call, kind);
    assert.deepEqual([planned.call.x, planned.call.z], [task.stops[1].x, task.stops[1].z]);
    assert.ok(planned.task.par >= task.par + CALL_SECONDS, `${kind} par ${task.par} → ${planned.task.par}`);
    assert.equal(task.stops[1].call, undefined, 'the original task is untouched');
  }
  const fire = planTask('firefighter', graph, door, { seed: 2, collider });
  assert.equal(planCall(fire, 'lost-child', graph), null);
  assert.equal(planCall(task, 'bank-robbery', graph), null);
});

test('the pulled-over car sits in the road at the kerb beside the stop, facing along the street', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const { call } = planCall(patrol(seed), 'traffic-stop', graph);
    assert.ok(call.car, `seed ${seed}`);
    const street = nearestStreet(graph, call.car.x, call.car.z);
    assert.ok(street.distance < street.lane * 2, `seed ${seed}: car ${street.distance.toFixed(1)} m off the centre line, on the road`);
    const gap = Math.hypot(call.car.x - call.x, call.car.z - call.z);
    assert.ok(gap > 1.2 && gap < 8, `seed ${seed}: ${gap.toFixed(1)} m from the stop`);
    // Facing along the street (either way), not across it.
    const along = Math.abs(Math.sin(call.car.rotation) * street.dx + Math.cos(call.car.rotation) * street.dz);
    assert.ok(along > 0.95, `seed ${seed}: along ${along.toFixed(2)}`);
  }
});

test('the noise complaint\'s door is set back from the street, behind the stop', () => {
  const { call } = planCall(patrol(), 'noise-complaint', graph);
  const stopStreet = nearestStreet(graph, call.x, call.z).distance;
  const doorStreet = nearestStreet(graph, call.door.x, call.door.z).distance;
  assert.ok(doorStreet > stopStreet, `door ${doorStreet.toFixed(1)} m vs stop ${stopStreet.toFixed(1)} m from the street`);
});

test('the patrol waits at the call until you\'ve answered it, then moves on', () => {
  const { task, call } = planCall(patrol(), 'traffic-stop', graph);
  let t = { ...task, next: 1 };
  let c = call;
  assert.equal(holdsTask(t, c), true);
  // Far away: nothing.
  assert.equal(stepCall(c, { x: c.x + 50, z: c.z, seconds: 1 }).event, null);
  // At the wheel: one reminder to get out.
  let stepped = stepCall(c, { x: c.x + 3, z: c.z, driving: true });
  assert.equal(stepped.event.type, 'on-foot');
  assert.equal(stepCall(stepped.call, { x: c.x + 3, z: c.z, driving: true }).event, null);
  // On foot: the driver speaks, and three answers are offered.
  stepped = stepCall(stepped.call, { x: c.x + 2, z: c.z });
  assert.equal(stepped.event.type, 'arrive');
  c = stepped.call;
  assert.equal(c.phase, 'talk');
  assert.equal(callStatus(c).options.length, 3);
  assert.equal(chooseCall(c, 7).event, null, 'no such answer');
  const chosen = chooseCall(c, 0);
  assert.equal(chosen.event.type, 'resolved');
  assert.equal(chosen.event.tone, 'best');
  assert.equal(chosen.call.done, true);
  assert.equal(holdsTask(t, chosen.call), false);
  t = resolveCall(t, chosen.call);
  assert.equal(t.next, 2);
  assert.equal(chooseCall(chosen.call, 1).event, null, 'answered once');
});

test('a lost child follows you to his dad, and is handed over only when both of you are there', () => {
  const { task, call } = planCall(patrol(), 'lost-child', graph);
  assert.ok(call.child && call.parent);
  const toDad = Math.hypot(call.parent.x - call.x, call.parent.z - call.z);
  assert.ok(toDad > 10 && toDad < 400, `dad waits ${toDad.toFixed(0)} m away`);
  let c = stepCall(call, { x: call.x, z: call.z }).call;
  const chosen = chooseCall(c, 1);
  assert.equal(chosen.event.type, 'escort');
  assert.match(chosen.event.line, /his dad/);
  c = chosen.call;
  assert.equal(c.phase, 'escort');
  assert.deepEqual(callTarget(c), { x: c.parent.x, z: c.parent.z, label: 'Walk him to his dad' });
  // Walk to dad in 0.1 s steps; the child keeps up behind you.
  let x = call.x, z = call.z;
  const dx = (c.parent.x - x) / toDad, dz = (c.parent.z - z) / toDad;
  const heading = Math.atan2(-dx, -dz);
  let event = null;
  for (let i = 0; i < 4000 && !event; i++) {
    x += dx * 0.3; z += dz * 0.3;
    ({ call: c, event } = stepCall(c, { x, z, heading, seconds: 0.1 }));
    if (!event) assert.ok(Math.hypot(c.child.x - x, c.child.z - z) < 8, 'the child keeps up');
  }
  assert.equal(event?.type, 'resolved');
  assert.match(event.line, /Thank you/);
  assert.equal(c.done, true);
  assert.equal(resolveCall({ ...task, next: 1 }, c).next, 2);
  assert.equal(callResult(c, 100).title, CONDUCT.ok.title);
  assert.equal(callResult(c, 100).bonus, 20);
});

test('in a car the child waits; teleporting ahead, he catches up at once', () => {
  const child = { x: 0, z: 0, heading: 0, moving: false };
  const near = stepFollower(child, { x: 3, z: 0, heading: Math.PI / 2 }, 0.1);
  assert.equal(near.moving, true);
  assert.ok(Math.hypot(near.x, near.z) > 0 && Math.hypot(near.x, near.z) < 0.4, 'a walking step');
  const far = stepFollower(child, { x: 100, z: 0, heading: -Math.PI / 2 }, 0.1);
  // Wherever the leader faces, he lands one gap behind them.
  assert.ok(Math.abs(Math.hypot(far.x - 100, far.z) - FOLLOW_GAP) < 1e-9);
  const { call } = planCall(patrol(), 'lost-child', graph);
  let c = chooseCall(stepCall(call, { x: call.x, z: call.z }).call, 0).call;
  const before = { ...c.child };
  c = stepCall(c, { x: call.x + 9, z: call.z, seconds: 1, driving: true }).call;
  assert.deepEqual([c.child.x, c.child.z], [before.x, before.z]);
  // Driving up to dad doesn't count: you hand him over on foot.
  assert.equal(stepCall(c, { x: c.parent.x, z: c.parent.z, driving: true }).event, null);
});

test('the call\'s bonus follows how you treated people; an unanswered call pays nothing', () => {
  const { call } = planCall(patrol(), 'noise-complaint', graph);
  const talk = stepCall(call, { x: call.x, z: call.z }).call;
  const results = [0, 1, 2].map(i => callResult(chooseCall(talk, i).call, 95));
  assert.deepEqual(results.map(r => r.grade), ['best', 'ok', 'poor']);
  assert.deepEqual(results.map(r => r.bonus), [38, 19, 0]);
  assert.equal(callResult(talk, 95).bonus, 0);
  assert.equal(callResult(null, 95).bonus, 0);
});

test('stepTask still runs the rest of the patrol after the call (no double count at the call\'s stop)', () => {
  const { task, call } = planCall(patrol(), 'traffic-stop', graph);
  // First stop as normal.
  let t = stepTask(task, { x: task.stops[0].x, z: task.stops[0].z, seconds: 1 }).task;
  assert.equal(t.next, 1);
  assert.equal(holdsTask(t, call), true);
  const answered = chooseCall(stepCall(call, { x: call.x, z: call.z }).call, 0).call;
  t = resolveCall(t, answered);
  assert.equal(t.next, 2);
  const after = stepTask(t, { x: t.stops[2].x, z: t.stops[2].z, seconds: 1 });
  assert.equal(after.event?.type, 'stop');
  assert.equal(after.event.index, 2);
});
