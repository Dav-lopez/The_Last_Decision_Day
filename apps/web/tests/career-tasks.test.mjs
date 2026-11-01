import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TASKS, TASK_REACH, formatClock, planTask, stepTask, taskResult, taskStatus } from '../src/world/careerTasks.mjs';
import { CAREERS, workplaceDoors } from '../src/world/careers.mjs';
import { CITY_ORIGIN, createCityCollider, readCity } from '../src/world/cityLayout.mjs';
import { buildRoadGraph } from '../src/world/cityTraffic.mjs';

const city = readCity(JSON.parse(readFileSync(new URL('../public/city/boulder-pearl-street.json', import.meta.url))));
const collider = createCityCollider(city);
const graph = buildRoadGraph(city.roads);
const doors = workplaceDoors(city, collider);
const localDoor = id => { const d = doors.get(id); return { x: d.x - CITY_ORIGIN.x, z: d.z - CITY_ORIGIN.z }; };

test('every career has a duty with a stop line for each stop', () => {
  assert.deepEqual(Object.keys(TASKS).sort(), Object.keys(CAREERS).sort());
  for (const spec of Object.values(TASKS)) {
    assert.ok(spec.stops.length >= 3 && spec.title && spec.brief && spec.signOff);
    // No crime or weapons on duty: these are community jobs.
    for (const line of [...spec.stops, spec.brief]) assert.doesNotMatch(line, /gun|shoot|arrest|weapon|chase/i);
  }
  assert.equal(TASKS.soldier.onFoot, true);
});

test('duty runs on real downtown streets: stops on walkable pavement near the workplace, ending at the door', () => {
  for (const id of Object.keys(CAREERS)) {
    const door = localDoor(id);
    const task = planTask(id, graph, door, { seed: 3, collider });
    assert.ok(task, id);
    assert.equal(task.stops.length, TASKS[id].stops.length + 1, `${id} plans every stop`);
    const last = task.stops.at(-1);
    assert.equal(last.final, true);
    assert.deepEqual([last.x, last.z], [door.x, door.z]);
    for (const stop of task.stops.slice(0, -1)) {
      assert.equal(collider.blockedLocal(stop.x, stop.z), false, `${id} stop is walkable`);
      assert.ok(Math.hypot(stop.x - door.x, stop.z - door.z) < 420, `${id} stop stays near the workplace`);
      assert.ok(Math.hypot(stop.x - door.x, stop.z - door.z) >= 30, `${id} stop is a walk away`);
    }
    // Par: enough time for a jog round the route, not a whole afternoon.
    assert.ok(task.par > 40 && task.par < 600, `${id} par ${task.par}s`);
  }
});

test('plans are deterministic per seed and differ between shifts', () => {
  const door = localDoor('police');
  const a = planTask('police', graph, door, { seed: 1, collider });
  assert.deepEqual(planTask('police', graph, door, { seed: 1, collider }), a);
  const others = [2, 3, 4, 5].map(seed => planTask('police', graph, door, { seed, collider }));
  assert.ok(others.some(b => JSON.stringify(b.stops) !== JSON.stringify(a.stops)), 'a different beat on another shift');
});

test('no plan without roads, a door or a known career', () => {
  assert.equal(planTask('police', null, { x: 0, z: 0 }), null);
  assert.equal(planTask('astronaut', graph, localDoor('police')), null);
  assert.equal(planTask('police', graph, null), null);
  assert.equal(planTask('police', graph, { x: 50000, z: 50000 }), null);
});

test('stepping through the stops in order, then signing off', () => {
  let task = planTask('firefighter', graph, localDoor('firefighter'), { seed: 2, collider });
  const far = stepTask(task, { x: task.stops[1].x, z: task.stops[1].z, seconds: 0.5 });
  assert.equal(far.event, null, 'the second stop does not count before the first');
  assert.equal(far.task.elapsed, 0.5);
  const lines = [];
  for (const stop of task.stops) {
    const r = stepTask(task, { x: stop.x + TASK_REACH - 1, z: stop.z, seconds: 1 });
    task = r.task;
    lines.push(r.event.type === 'stop' ? r.event.line : r.event.type);
  }
  assert.deepEqual(lines, [...TASKS.firefighter.stops, 'done']);
  assert.equal(task.done, true);
  assert.equal(stepTask(task, { x: 0, z: 0, seconds: 1 }).task.elapsed, task.elapsed, 'a finished run stops the clock');
});

test('a route march only counts on foot, and says so once', () => {
  let task = planTask('soldier', graph, localDoor('soldier'), { seed: 1, collider });
  const s = task.stops[0];
  let r = stepTask(task, { ...s, driving: true, seconds: 0.1 });
  assert.equal(r.event.type, 'on-foot');
  r = stepTask(r.task, { ...s, driving: true, seconds: 0.1 });
  assert.equal(r.event, null);
  r = stepTask(r.task, { ...s, seconds: 0.1 });
  assert.equal(r.event.type, 'stop');
  // Police can drive the beat.
  task = planTask('police', graph, localDoor('police'), { seed: 1, collider });
  let step = stepTask(task, { ...task.stops[0], driving: true });
  assert.equal(step.event.type, 'stop');
  // ...but signs off at the door on foot.
  task = { ...step.task, next: task.stops.length - 1 };
  step = stepTask(task, { ...task.stops.at(-1), driving: true });
  assert.equal(step.event.type, 'on-foot');
  assert.equal(stepTask(step.task, { ...task.stops.at(-1) }).event.type, 'done');
});

test('bonus by time: outstanding inside three quarters of par, on time, or late', () => {
  const task = { par: 100, elapsed: 60 };
  assert.deepEqual(taskResult(task, 90), { band: 'outstanding', title: 'Outstanding', bonus: 45, seconds: 60, par: 100 });
  assert.equal(taskResult({ par: 100, elapsed: 99 }, 90).bonus, 23);
  assert.equal(taskResult({ par: 100, elapsed: 140 }, 90).band, 'late');
  assert.equal(taskResult({ par: 100, elapsed: 140 }, 90).bonus, 0);
  assert.equal(taskResult(null, 90).bonus, 0);
});

test('HUD status counts stops and time left', () => {
  const task = planTask('police', graph, localDoor('police'), { seed: 1, collider });
  assert.deepEqual(taskStatus(task), { title: 'Patrol route', next: 'Stop 1 of 4', done: 0, total: 4, left: task.par, onFoot: false });
  const atEnd = { ...task, next: 4, elapsed: task.par + 5 };
  assert.equal(taskStatus(atEnd).next, TASKS.police.signOff);
  assert.equal(taskStatus(atEnd).left, -5);
  assert.equal(formatClock(75), '1:15');
  assert.equal(formatClock(-5), '+0:05');
  assert.equal(taskStatus(null), null);
});
