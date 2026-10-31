/**
 * Loading screen progress: the world's downloads are tracked as weighted tasks.
 *
 * Foreground tasks (Maple Street, your character, the neighbours…) keep the loading
 * screen up; background tasks (downtown) carry on after it closes and show as a small chip.
 * A task that is under way but reports no byte progress "creeps" towards 90 % of its share,
 * so the bar keeps moving on slow connections without ever claiming to be finished.
 * Time is passed in (milliseconds) so the rules are testable without a clock.
 */

/** @typedef {{ id: string, label: string, weight: number, background?: boolean }} LoadTask */

export const WORLD_LOAD_TASKS = Object.freeze([
  Object.freeze({ id: 'scene', label: 'Building Maple Street', weight: 2 }),
  Object.freeze({ id: 'character', label: 'Dressing your character', weight: 3 }),
  Object.freeze({ id: 'school', label: 'Unlocking the school', weight: 1 }),
  Object.freeze({ id: 'neighbours', label: 'Waking the neighbours', weight: 2 }),
  Object.freeze({ id: 'props', label: 'Setting out the street furniture', weight: 1 }),
  Object.freeze({ id: 'cars', label: 'Parking the cars', weight: 1 }),
  Object.freeze({ id: 'downtown', label: 'Mapping downtown Boulder', weight: 2, background: true }),
]);

export const LOADING = Object.freeze({
  /** A task with no reported progress reaches half of its creep ceiling after this long. */
  creepHalfLifeMs: 2500,
  /** Creep never passes this share of a task, so 100 % always means really done. */
  creepCeiling: 0.9,
  /** The loading screen never holds the player longer than this; the rest loads in the world. */
  maxWaitMs: 45000,
  /** After this long a "Start now" button lets the player skip the wait. */
  skipAfterMs: 8000,
  /** How fast the displayed bar catches up with the real progress (per second). */
  easeRate: 5,
});

export const LOADING_TIPS = Object.freeze([
  'Walk with W A S D or the arrow keys. Hold Shift to run.',
  'Press N for the map: take a taxi downtown, to the pitch or to work.',
  'Press E next to doors, cars, people and signs.',
  'Talk to the neighbours: they remember how you treat them.',
  'Your energy drops through the day. Eat and sleep at home.',
  'Press Esc or ☰ for the menu, controls and settings.',
]);

const clamp01 = value => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

/** Progress share of a task that has been running for `elapsedMs` with no byte progress. */
export function creep(elapsedMs, halfLifeMs = LOADING.creepHalfLifeMs, ceiling = LOADING.creepCeiling) {
  if (!(elapsedMs > 0)) return 0;
  return ceiling * (1 - Math.pow(2, -elapsedMs / halfLifeMs));
}

/** Moves the displayed fraction towards the target; never goes backwards, snaps when close. */
export function easeProgress(displayed, target, seconds, rate = LOADING.easeRate) {
  const from = clamp01(displayed);
  const to = clamp01(target);
  if (to <= from) return from;
  const next = from + (to - from) * (1 - Math.exp(-rate * Math.max(0, seconds)));
  return to - next < 0.002 ? to : next;
}

/** One tip per few seconds, cycling. */
export function tipAt(elapsedMs, tips = LOADING_TIPS, everyMs = 4500) {
  if (!tips.length) return '';
  const index = Math.floor(Math.max(0, elapsedMs) / everyMs) % tips.length;
  return tips[index];
}

/**
 * @param {readonly LoadTask[]} tasks
 * @param {number} now creation time in ms
 */
export function createLoadingTracker(tasks = WORLD_LOAD_TASKS, now = 0) {
  const createdAt = now;
  const entries = new Map(tasks.map(task => [task.id, {
    id: task.id, label: task.label, weight: Math.max(0, task.weight), background: Boolean(task.background),
    state: 'pending', startedAt: 0, reported: null,
  }]));
  let skipped = false;
  const entry = id => entries.get(id);

  const fractionOf = (task, at) => {
    if (task.state === 'done' || task.state === 'failed') return 1;
    if (task.state === 'pending') return 0;
    const crept = creep(at - task.startedAt);
    return task.reported === null ? crept : Math.max(crept * 0.5, Math.min(LOADING.creepCeiling + 0.09, task.reported));
  };

  return {
    start(id, at) {
      const task = entry(id);
      if (!task || task.state !== 'pending') return;
      task.state = 'loading';
      task.startedAt = at;
    },
    /** Byte progress from a download, 0–1. Starts the task if needed. */
    progress(id, fraction, at) {
      const task = entry(id);
      if (!task || task.state === 'done' || task.state === 'failed') return;
      if (task.state === 'pending') { task.state = 'loading'; task.startedAt = at; }
      task.reported = Math.max(task.reported ?? 0, clamp01(fraction));
    },
    finish(id) {
      const task = entry(id);
      if (task && task.state !== 'failed') task.state = 'done';
    },
    /** A failed download still counts as settled: the game plays on with a fallback. */
    fail(id) {
      const task = entry(id);
      if (task && task.state !== 'done') task.state = 'failed';
    },
    skip() { skipped = true; },
    snapshot(at) {
      const all = [...entries.values()];
      const foreground = all.filter(task => !task.background);
      const total = foreground.reduce((sum, task) => sum + task.weight, 0);
      const fraction = total > 0 ? foreground.reduce((sum, task) => sum + task.weight * fractionOf(task, at), 0) / total : 1;
      const settled = foreground.every(task => task.state === 'done' || task.state === 'failed');
      const elapsed = Math.max(0, at - createdAt);
      const current = foreground.find(task => task.state === 'loading') ?? foreground.find(task => task.state === 'pending') ?? null;
      const background = all.filter(task => task.background && (task.state === 'loading' || task.state === 'pending'))
        .map(task => ({ id: task.id, label: task.label, fraction: fractionOf(task, at) }));
      return {
        fraction: settled ? 1 : Math.min(0.99, fraction),
        ready: settled || skipped || elapsed >= LOADING.maxWaitMs,
        canSkip: !settled && elapsed >= LOADING.skipAfterMs,
        label: settled ? 'Ready' : current?.label ?? 'Ready',
        elapsed,
        tasks: foreground.map(task => ({ id: task.id, label: task.label, state: task.state })),
        failed: all.filter(task => task.state === 'failed').map(task => task.id),
        background,
      };
    },
  };
}
