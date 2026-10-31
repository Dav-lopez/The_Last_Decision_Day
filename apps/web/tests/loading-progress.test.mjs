import test from 'node:test';
import assert from 'node:assert/strict';
import { LOADING, LOADING_TIPS, WORLD_LOAD_TASKS, createLoadingTracker, creep, easeProgress, tipAt } from '../src/world/loadingProgress.mjs';

const tasks = [
  { id: 'a', label: 'Task A', weight: 1 },
  { id: 'b', label: 'Task B', weight: 3 },
  { id: 'bg', label: 'Background', weight: 2, background: true },
];

test('nothing started is 0 % and not ready', () => {
  const view = createLoadingTracker(tasks, 0).snapshot(0);
  assert.equal(view.fraction, 0);
  assert.equal(view.ready, false);
  assert.equal(view.label, 'Task A');
  assert.deepEqual(view.tasks.map(task => task.id), ['a', 'b']);
});

test('progress is weighted and background tasks do not hold the screen', () => {
  const tracker = createLoadingTracker(tasks, 0);
  tracker.start('a', 0); tracker.finish('a');
  assert.equal(tracker.snapshot(0).fraction, 0.25);
  tracker.start('bg', 0);
  tracker.start('b', 0); tracker.finish('b');
  const view = tracker.snapshot(10);
  assert.equal(view.fraction, 1);
  assert.equal(view.ready, true);
  assert.equal(view.label, 'Ready');
  assert.deepEqual(view.background.map(task => task.id), ['bg']);
  tracker.finish('bg');
  assert.deepEqual(tracker.snapshot(20).background, []);
});

test('a failed download still settles the screen and is reported', () => {
  const tracker = createLoadingTracker(tasks, 0);
  tracker.finish('a');
  tracker.fail('b');
  const view = tracker.snapshot(0);
  assert.equal(view.ready, true);
  assert.deepEqual(view.failed, ['b']);
  tracker.finish('b');
  assert.equal(tracker.snapshot(0).tasks[1].state, 'failed', 'a failure is not overwritten');
});

test('a running task creeps but never reaches 100 % on its own', () => {
  assert.equal(creep(0), 0);
  assert.ok(Math.abs(creep(LOADING.creepHalfLifeMs) - LOADING.creepCeiling / 2) < 1e-9);
  assert.ok(creep(1e9) <= LOADING.creepCeiling);
  const tracker = createLoadingTracker([{ id: 'x', label: 'X', weight: 1 }], 0);
  tracker.start('x', 0);
  const early = tracker.snapshot(1000).fraction;
  const late = tracker.snapshot(20000).fraction;
  assert.ok(early > 0 && late > early && late < 1);
});

test('byte progress moves a task forward and never backwards', () => {
  const tracker = createLoadingTracker([{ id: 'x', label: 'X', weight: 1 }], 0);
  tracker.progress('x', 0.6, 0);
  assert.ok(Math.abs(tracker.snapshot(0).fraction - 0.6) < 1e-9);
  tracker.progress('x', 0.3, 10);
  assert.ok(tracker.snapshot(10).fraction >= 0.6);
  tracker.progress('x', 1, 20);
  assert.ok(tracker.snapshot(20).fraction < 1, 'only finish() completes a task');
});

test('the screen can be skipped after a while and never blocks forever', () => {
  const tracker = createLoadingTracker(tasks, 1000);
  assert.equal(tracker.snapshot(1000 + LOADING.skipAfterMs - 1).canSkip, false);
  assert.equal(tracker.snapshot(1000 + LOADING.skipAfterMs).canSkip, true);
  assert.equal(tracker.snapshot(1000 + LOADING.maxWaitMs).ready, true);
  const skipped = createLoadingTracker(tasks, 0);
  skipped.skip();
  assert.equal(skipped.snapshot(1).ready, true);
});

test('unknown task ids are ignored', () => {
  const tracker = createLoadingTracker(tasks, 0);
  tracker.start('nope', 0); tracker.progress('nope', 1, 0); tracker.finish('nope'); tracker.fail('nope');
  assert.equal(tracker.snapshot(0).fraction, 0);
});

test('the displayed bar eases forward and never backwards', () => {
  const step = easeProgress(0, 1, 0.1);
  assert.ok(step > 0 && step < 1);
  assert.equal(easeProgress(0.5, 0.2, 1), 0.5);
  assert.equal(easeProgress(0.999, 1, 0.016), 1);
  assert.equal(easeProgress(0, 1, -1), 0);
});

test('tips cycle and the world task list has downtown in the background', () => {
  assert.equal(tipAt(0), LOADING_TIPS[0]);
  assert.equal(tipAt(4500), LOADING_TIPS[1]);
  assert.equal(tipAt(4500 * LOADING_TIPS.length), LOADING_TIPS[0]);
  assert.equal(tipAt(0, []), '');
  assert.ok(WORLD_LOAD_TASKS.find(task => task.id === 'downtown')?.background);
  assert.ok(WORLD_LOAD_TASKS.filter(task => !task.background).every(task => task.weight > 0));
});
