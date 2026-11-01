/**
 * Downtown pedestrians: people walking the pavements beside the real streets
 * (the same road graph the traffic uses), waiting at signalised junctions and
 * crossing when the traffic alongside them has green. Pure and seeded; the
 * scene renders `pedestrianPoses` and hands the people to the traffic as
 * obstacles, so cars stop for anyone in the road.
 */
import { lightFor, makeRandom } from './cityTraffic.mjs';

export const WALK = Object.freeze({ minSpeed: 1.05, maxSpeed: 1.55, kerb: 1.5, waitAt: 3.2, respawnClear: 45, radius: 0.35 });

const endKey = (graph, p) => { const edge = graph.edges[p.edge]; return p.forward ? edge.to : edge.from; };

/**
 * How far from the road's centre the pavement is on each edge, kept clear of
 * buildings using `isInside(x, z)` (city-local). Edges with no room are not walked.
 */
export function pavementOffsets(graph, isInside = () => false) {
  return graph.edges.map(edge => {
    const ideal = edge.lane * 2 + WALK.kerb;
    for (let offset = ideal; offset >= edge.lane * 2 + 0.6; offset -= 0.3) {
      let clear = true;
      for (let s = 0; s <= edge.length && clear; s += 3) {
        const p = pointAt(edge, s);
        for (const side of [1, -1]) if (isInside(p.x + side * p.dz * offset, p.z - side * p.dx * offset)) clear = false;
      }
      if (clear) return offset;
    }
    return null;
  });
}

function pointAt(edge, s) {
  const d = Math.max(0, Math.min(edge.length, s));
  const c = edge.cumulative;
  let i = 1;
  while (i < c.length - 1 && c[i] < d) i++;
  const [ax, az] = edge.points[i - 1], [bx, bz] = edge.points[i];
  const span = c[i] - c[i - 1] || 1;
  const t = (d - c[i - 1]) / span;
  return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / span, dz: (bz - az) / span };
}

/** Where a walker is (city-local) and which way they face. `side` +1 is the right-hand pavement of the edge's direction. */
export function pedestrianPose(graph, offsets, p) {
  if (p.crossing) {
    const { from, to, t } = p.crossing;
    const len = Math.hypot(to.x - from.x, to.z - from.z) || 1;
    const k = Math.min(1, t / len);
    const dx = (to.x - from.x) / len, dz = (to.z - from.z) / len;
    return { x: from.x + (to.x - from.x) * k, z: from.z + (to.z - from.z) * k, dx, dz, heading: Math.atan2(dx, dz) };
  }
  const edge = graph.edges[p.edge];
  const d = p.forward ? p.s : edge.length - p.s;
  const q = pointAt(edge, d);
  const offset = offsets[p.edge] ?? edge.lane * 2 + WALK.kerb;
  const x = q.x + p.side * q.dz * offset, z = q.z - p.side * q.dx * offset;
  const dx = p.forward ? q.dx : -q.dx, dz = p.forward ? q.dz : -q.dz;
  return { x, z, dx, dz, heading: Math.atan2(dx, dz) };
}

function spawnWalker(graph, offsets, random, avoid, clear) {
  const walkable = graph.edges.filter(edge => offsets[edge.id] !== null);
  if (!walkable.length) return null;
  for (let tries = 0; tries < 50; tries++) {
    const edge = walkable[Math.floor(random() * walkable.length)];
    const p = { edge: edge.id, forward: random() < 0.5, s: random() * edge.length, side: random() < 0.5 ? 1 : -1 };
    const pose = pedestrianPose(graph, offsets, p);
    const nearest = avoid.length ? Math.min(...avoid.map(a => Math.hypot(a.x - pose.x, a.z - pose.z))) : Infinity;
    if (nearest >= clear && (tries > 35 || !avoid.length || nearest < clear + 110)) return p;
  }
  return null;
}

/** `count` walkers with their own pace and look index, spread over the pavements. */
export function createPedestrians(graph, offsets, count, seed = 3, avoid = []) {
  const random = makeRandom(seed);
  const people = [];
  for (let i = 0; i < count; i++) {
    const spot = spawnWalker(graph, offsets, random, avoid, 15);
    if (!spot) break;
    people.push({ ...spot, id: i, look: i, pace: WALK.minSpeed + random() * (WALK.maxSpeed - WALK.minSpeed), waiting: false, crossing: null });
  }
  return { people, random };
}

/**
 * Advance everyone. At a junction a walker picks another pavement leaving it;
 * at a signalised junction they wait at the kerb until the traffic travelling
 * their way has green, then cross. `focus` (the player) keeps respawns out of sight.
 */
export function stepPedestrians(graph, offsets, crowd, seconds, { signals = null, time = 0, focus = [] } = {}) {
  const dt = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.1)) : 0;
  if (!dt) return crowd;
  const { random } = crowd;
  const people = crowd.people.map(person => {
    const edge = graph.edges[person.edge];
    const node = endKey(graph, person);
    const remaining = edge.length - person.s;
    const light = lightFor(signals, person.edge, node, time);
    // Cross only with the parallel traffic's green; never start on yellow or red.
    const waiting = light !== null && light !== 'green' && remaining <= WALK.waitAt && remaining > WALK.waitAt - 0.6;
    if (waiting) return { ...person, waiting: true };
    // Crossing a street: walk the straight line to the far kerb first.
    if (person.crossing) {
      const t = person.crossing.t + person.pace * 1.15 * dt;
      const len = Math.hypot(person.crossing.to.x - person.crossing.from.x, person.crossing.to.z - person.crossing.from.z);
      return t >= len ? { ...person, crossing: null, waiting: false } : { ...person, crossing: { ...person.crossing, t }, waiting: false };
    }
    let next = { ...person, waiting: false, s: person.s + person.pace * dt };
    while (next.s >= graph.edges[next.edge].length) {
      const over = next.s - graph.edges[next.edge].length;
      const here = graph.nodes.get(endKey(graph, next));
      const options = here.edges.filter(id => id !== next.edge && offsets[id] !== null);
      if (!options.length) {
        const spot = spawnWalker(graph, offsets, random, focus, WALK.respawnClear);
        next = spot ? { ...next, ...spot, crossing: null } : { ...next, forward: !next.forward, s: 0 };
        break;
      }
      const id = options[Math.floor(random() * options.length) % options.length];
      const out = graph.edges[id];
      const from = pedestrianPose(graph, offsets, { ...next, s: graph.edges[next.edge].length });
      // Take the pavement on the near side of the new street; cross to it if it's over the road.
      const forward = out.from === here.key;
      const sides = [1, -1].map(side => ({ side, pose: pedestrianPose(graph, offsets, { edge: id, forward, s: 0, side }) }))
        .sort((a, b) => Math.hypot(a.pose.x - from.x, a.pose.z - from.z) - Math.hypot(b.pose.x - from.x, b.pose.z - from.z));
      const near = random() < 0.75 ? sides[0] : sides[1];
      const gap = Math.hypot(near.pose.x - from.x, near.pose.z - from.z);
      next = { ...next, edge: id, forward, side: near.side, s: gap > 0.6 ? 0 : over,
        crossing: gap > 0.6 ? { from: { x: from.x, z: from.z }, to: { x: near.pose.x, z: near.pose.z }, t: 0 } : null };
      if (next.crossing) break;
    }
    return next;
  });
  return { ...crowd, people };
}

/** Render data: city-local poses with walking/waiting state. */
export function pedestrianPoses(graph, offsets, crowd) {
  return crowd.people.map(person => ({ id: person.id, look: person.look, waiting: person.waiting, pace: person.pace, crossing: Boolean(person.crossing), ...pedestrianPose(graph, offsets, person) }));
}
