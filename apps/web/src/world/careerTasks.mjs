/**
 * Playable career duties (MVP 8b): instead of a fade-to-black shift, a short task downtown. A police patrol
 * route, a firefighter's call-out, an army route march: a chain of stops along real streets, then back to the
 * workplace to sign off. Finishing inside par time earns a bonus on the shift's pay. Pure: the scene shows the
 * marker and points the GPS at the next stop, this module decides where the stops are and how the run went.
 * City-local metres, using the road graph from cityTraffic.buildRoadGraph.
 */
import { makeRandom } from './cityTraffic.mjs';

export const TASK_REACH = 6;       // metres from a stop on foot
export const TASK_REACH_CAR = 10;  // metres from a stop at the wheel
const MAX_RADIUS = 300;            // stops stay this close to the workplace
const PACE = 3.2;                  // par pace in m/s: a jog, with a little slack for corners
const STOP_SECONDS = 8;            // par allowance per stop

export const TASKS = Object.freeze({
  police: Object.freeze({
    id: 'patrol', title: 'Patrol route', spacing: 70, onFoot: false,
    brief: 'Walk or drive the beat: four stops, then sign off at the station.',
    stops: Object.freeze([
      'Shop doors checked on the block: all locked up.',
      'A visitor asks the way to the library: you point them there.',
      'You see a family safely across the junction.',
      'Radio check: "All quiet on the beat."',
    ]),
    signOff: 'Sign off at the Police Station',
  }),
  firefighter: Object.freeze({
    id: 'fire-call', title: 'Fire call', spacing: 110, onFoot: false,
    brief: 'Smoke alarm call-out: get to the address fast, check the hydrant, report back.',
    stops: Object.freeze([
      'On scene: burnt toast set the alarm off. You air the kitchen out.',
      'Hydrant on the corner checked: good pressure.',
      'Smoke alarm reset and tested for the residents.',
    ]),
    signOff: 'Back to the Fire Station',
  }),
  soldier: Object.freeze({
    id: 'route-march', title: 'Route march', spacing: 80, onFoot: true,
    brief: 'On foot only: five checkpoints with your pack, then report back.',
    stops: Object.freeze([
      'Checkpoint Alpha: water break.',
      'Checkpoint Bravo: map and compass check.',
      'Checkpoint Charlie: pack straps tightened.',
      'Checkpoint Delta: halfway sign-off.',
      'Checkpoint Echo: last leg home.',
    ]),
    signOff: 'Report back to the Recruiting Office',
  }),
});

const BANDS = Object.freeze([
  Object.freeze({ id: 'outstanding', title: 'Outstanding', within: 0.75, bonus: 0.5 }),
  Object.freeze({ id: 'good', title: 'On time', within: 1, bonus: 0.25 }),
  Object.freeze({ id: 'late', title: 'Late', within: Infinity, bonus: 0 }),
]);

/**
 * Plan a duty run from the workplace door (city-local). Stops are on the pavement beside real streets: the
 * middle of a road segment, pushed out to the side and checked against the collider when one is given.
 * Deterministic for a seed (the scene uses the shift count, so each shift walks a different beat).
 * @returns {null | { career: string, id: string, title: string, brief: string, onFoot: boolean,
 *   stops: { x: number, z: number, line: string, final: boolean }[], next: number, elapsed: number,
 *   par: number, length: number, done: boolean, warnedOnFoot: boolean }}
 */
export function planTask(career, graph, door, { seed = 1, collider = null } = {}) {
  const spec = TASKS[career];
  if (!spec || !graph?.edges?.length || !door || !Number.isFinite(door.x) || !Number.isFinite(door.z)) return null;
  const random = makeRandom(seed * 7919 + career.length);
  const nodes = graph.nodes;
  const near = (n) => Math.hypot(n.x - door.x, n.z - door.z);
  // Start at the junction nearest the door.
  let current = null;
  for (const n of nodes.values()) if (!current || near(n) < near(current)) current = n;
  if (!current || near(current) > MAX_RADIUS) return null;
  const usedEdges = new Set();
  const stops = [];
  let walked = 0;
  let previous = { x: door.x, z: door.z };
  let length = 0;
  for (let guard = 0; stops.length < spec.stops.length && guard < 200; guard++) {
    const options = current.edges.map(id => graph.edges[id]).filter(edge => {
      const other = nodes.get(edge.from === current.key ? edge.to : edge.from);
      return other && near(other) <= MAX_RADIUS;
    });
    if (!options.length) break;
    const fresh = options.filter(edge => !usedEdges.has(edge.id));
    const pool = fresh.length ? fresh : options;
    const edge = pool[Math.floor(random() * pool.length)];
    usedEdges.add(edge.id);
    walked += edge.length;
    current = nodes.get(edge.from === current.key ? edge.to : edge.from);
    if (walked < spec.spacing || edge.length < 12) continue;
    const spot = pavementSpot(edge, random() < 0.5 ? 1 : -1, collider);
    if (!spot) continue;
    if (stops.some(s => Math.hypot(s.x - spot.x, s.z - spot.z) < spec.spacing * 0.5)) continue;
    if (Math.hypot(spot.x - door.x, spot.z - door.z) < 30) continue;
    length += Math.hypot(spot.x - previous.x, spot.z - previous.z) * 1.25;
    previous = spot;
    stops.push({ ...spot, line: spec.stops[stops.length], final: false });
    walked = 0;
  }
  if (!stops.length) return null;
  length += Math.hypot(door.x - previous.x, door.z - previous.z) * 1.25;
  stops.push({ x: door.x, z: door.z, line: spec.signOff, final: true });
  return {
    career, id: spec.id, title: spec.title, brief: spec.brief, onFoot: spec.onFoot, stops, next: 0, elapsed: 0,
    par: Math.ceil(length / PACE + STOP_SECONDS * stops.length), length: Math.round(length), done: false, warnedOnFoot: false,
  };
}

/** The middle of a road segment, pushed out to one side (pavement), or the other side if that one is blocked. */
function pavementSpot(edge, side, collider) {
  const half = edge.length / 2;
  const c = edge.cumulative;
  let i = 1;
  while (i < c.length - 1 && c[i] < half) i++;
  const [ax, az] = edge.points[i - 1], [bx, bz] = edge.points[i];
  const span = (c[i] - c[i - 1]) || 1;
  const t = (half - c[i - 1]) / span;
  const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
  const nx = -(bz - az) / span, nz = (bx - ax) / span;
  const out = edge.lane * 2 + 1.5;
  for (const s of [side, -side]) {
    const px = x + nx * out * s, pz = z + nz * out * s;
    if (!collider || !collider.blockedLocal(px, pz)) return { x: px, z: pz };
  }
  return collider && !collider.blockedLocal(x, z) ? { x, z } : collider ? null : { x, z };
}

/**
 * Advance a duty run by `seconds` with the player (or their car) at (x, z). Returns the new task and what happened:
 * `{ type: 'stop', index, line }` at a stop, `{ type: 'done' }` at the final one, `{ type: 'on-foot' }` once when a
 * march stop (or the sign-off at the door) is attempted at the wheel, or null.
 */
export function stepTask(task, { x, z, seconds = 0, driving = false }) {
  if (!task || task.done) return { task, event: null };
  const next = { ...task, elapsed: task.elapsed + Math.max(0, Math.min(1, Number(seconds) || 0)) };
  const stop = task.stops[task.next];
  if (!stop || !Number.isFinite(x) || !Number.isFinite(z)) return { task: next, event: null };
  const reach = driving ? TASK_REACH_CAR : TASK_REACH;
  if (Math.hypot(x - stop.x, z - stop.z) > reach) return { task: next, event: null };
  // A march only counts on foot, and everyone signs off on foot at the door (park up and walk in).
  if (driving && (task.onFoot || stop.final)) {
    if (task.warnedOnFoot) return { task: next, event: null };
    return { task: { ...next, warnedOnFoot: true }, event: { type: 'on-foot' } };
  }
  const index = task.next;
  next.next = index + 1;
  next.warnedOnFoot = false;
  if (stop.final) { next.done = true; return { task: next, event: { type: 'done' } }; }
  return { task: next, event: { type: 'stop', index, line: stop.line } };
}

/** How the run went and the bonus on top of the shift's base pay. */
export function taskResult(task, basePay) {
  const ratio = task && task.par > 0 ? task.elapsed / task.par : Infinity;
  const band = BANDS.find(b => ratio <= b.within) ?? BANDS[BANDS.length - 1];
  const pay = Math.max(0, Math.floor(Number(basePay) || 0));
  return { band: band.id, title: band.title, bonus: Math.round(pay * band.bonus), seconds: Math.round(task?.elapsed ?? 0), par: task?.par ?? 0 };
}

/** HUD summary: title, what to do next, stop count and time left on par (negative when over). */
export function taskStatus(task) {
  if (!task) return null;
  const stop = task.stops[Math.min(task.next, task.stops.length - 1)];
  const regular = task.stops.length - 1;
  return {
    title: task.title,
    next: stop.final ? stop.line : `Stop ${Math.min(task.next + 1, regular)} of ${regular}`,
    done: Math.min(task.next, regular), total: regular,
    left: Math.round(task.par - task.elapsed),
    onFoot: task.onFoot,
  };
}

export const formatClock = (seconds) => {
  const s = Math.abs(Math.round(seconds));
  return `${seconds < 0 ? '+' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
