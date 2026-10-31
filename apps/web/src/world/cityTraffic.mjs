/**
 * Downtown traffic: AI cars driving the real (OpenStreetMap) street network.
 *
 * Roads are polylines in city-local metres. We keep the drivable ones, split
 * them at junctions into edges, and let each car drive an edge in one
 * direction, keeping to the right-hand lane. At the end of an edge it picks
 * another road leaving that junction (never straight back, unless it must);
 * at a dead end it quietly reappears somewhere out of the player's way.
 *
 * Cars follow the car ahead at a safe gap, ease off for junctions, and stop
 * for the player (on foot or driving). Pure and deterministic given the seed:
 * the scene only renders `trafficPoses`.
 */

export const DRIVABLE = Object.freeze(['primary', 'secondary', 'tertiary', 'residential', 'unclassified']);
/** Cruising speeds, m/s (≈ 40, 36, 32, 25 km/h). */
export const CRUISE = Object.freeze({ primary: 11, secondary: 10, tertiary: 9, residential: 7, unclassified: 7 });
export const TRAFFIC = Object.freeze({
  accel: 2.6, brake: 7, junctionSpeed: 4.5, junctionSlowAt: 9, carLength: 4.4, gap: 2.2, lookAhead: 18,
  laneMax: 1.7, playerRadius: 1.2, respawnClear: 70, minEdge: 3, junctionBox: 6, junctionWait: 10,
});

const key = ([x, z]) => `${Math.round(x * 10)},${Math.round(z * 10)}`;

/** Small deterministic PRNG (mulberry32). */
export function makeRandom(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Split the drivable roads into junction-to-junction edges.
 * Returns { nodes: Map<key, {x, z, edges: number[]}>, edges: Edge[] } where an
 * Edge is { id, from, to, points, cumulative, length, kind, lane }.
 */
export function buildRoadGraph(roads) {
  const drivable = (roads ?? []).filter(road => DRIVABLE.includes(road?.kind) && Array.isArray(road.points) && road.points.length >= 2);
  // A point is a junction if two roads share it, or a road ends there.
  const uses = new Map();
  for (const road of drivable) {
    const seen = new Set();
    road.points.forEach((point, i) => {
      const k = key(point);
      if (seen.has(k)) return;
      seen.add(k);
      uses.set(k, (uses.get(k) ?? 0) + (i === 0 || i === road.points.length - 1 ? 2 : 1));
    });
  }
  const nodes = new Map();
  const edges = [];
  const node = point => {
    const k = key(point);
    if (!nodes.has(k)) nodes.set(k, { key: k, x: point[0], z: point[1], edges: [] });
    return nodes.get(k);
  };
  for (const road of drivable) {
    let run = [road.points[0]];
    for (let i = 1; i < road.points.length; i++) {
      run.push(road.points[i]);
      const last = i === road.points.length - 1;
      if (last || (uses.get(key(road.points[i])) ?? 0) >= 2) {
        addEdge(run, road);
        run = [road.points[i]];
      }
    }
  }
  function addEdge(points, road) {
    const cumulative = [0];
    for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    const length = cumulative[cumulative.length - 1];
    if (!(length >= TRAFFIC.minEdge)) return;
    const from = node(points[0]), to = node(points[points.length - 1]);
    if (from === to) return;
    const id = edges.length;
    const width = Number.isFinite(road.width) ? road.width : 7;
    edges.push(Object.freeze({
      id, from: from.key, to: to.key, points: Object.freeze(points.map(p => Object.freeze([p[0], p[1]]))),
      cumulative: Object.freeze(cumulative), length, kind: road.kind,
      lane: Math.min(TRAFFIC.laneMax, Math.max(1.2, width / 4)),
    }));
    from.edges.push(id);
    to.edges.push(id);
  }
  return { nodes, edges };
}

/** Point and direction `s` metres along an edge, driving forward (from → to) or backward. */
export function edgePoint(edge, s, forward = true) {
  const d = Math.max(0, Math.min(edge.length, forward ? s : edge.length - s));
  const c = edge.cumulative;
  let i = 1;
  while (i < c.length - 1 && c[i] < d) i++;
  const [ax, az] = edge.points[i - 1], [bx, bz] = edge.points[i];
  const span = c[i] - c[i - 1] || 1;
  const t = (d - c[i - 1]) / span;
  let dx = (bx - ax) / span, dz = (bz - az) / span;
  if (!forward) { dx = -dx; dz = -dz; }
  return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx, dz };
}

/** Where a car is and which way it faces (city-local), in its right-hand lane. */
export function carPose(graph, car) {
  const edge = graph.edges[car.edge];
  const p = edgePoint(edge, car.s, car.forward);
  // Facing (dx, dz), the right-hand side is (dz, -dx) in Babylon's left-handed world.
  return { x: p.x + p.dz * edge.lane, z: p.z - p.dx * edge.lane, rotation: Math.atan2(p.dx, p.dz), dx: p.dx, dz: p.dz };
}

const endNode = (graph, car) => {
  const edge = graph.edges[car.edge];
  return graph.nodes.get(car.forward ? edge.to : edge.from);
};
const startNode = (graph, car) => {
  const edge = graph.edges[car.edge];
  return graph.nodes.get(car.forward ? edge.from : edge.to);
};

/**
 * Who is crossing each junction right now: cars within the junction box,
 * whether arriving (end of their road) or leaving (start of the next).
 * First come, first served: others wait at the line.
 */
export function junctionHolders(graph, cars) {
  const holders = new Map();
  const hold = (node, car) => {
    if (node.edges.length < 3) return;
    if (!holders.has(node.key)) holders.set(node.key, new Set());
    holders.get(node.key).add(car.id);
  };
  for (const car of cars) {
    const edge = graph.edges[car.edge];
    if (edge.length - car.s < TRAFFIC.junctionBox) hold(endNode(graph, car), car);
    if (car.s < TRAFFIC.junctionBox) hold(startNode(graph, car), car);
  }
  return holders;
}

/** Next road from the junction ahead: any other road, or null at a dead end. */
function nextEdge(graph, car, random) {
  const node = endNode(graph, car);
  const options = node.edges.filter(id => id !== car.edge);
  if (!options.length) return null;
  const id = options[Math.floor(random() * options.length) % options.length];
  const edge = graph.edges[id];
  return { edge: id, forward: edge.from === node.key, s: 0 };
}

/**
 * A fresh car on a random edge, at least `clear` metres from every point in
 * `avoid` (so it never pops into view) but, when possible, within a couple of
 * hundred metres of them, so the streets around the player stay busy.
 */
function spawn(graph, random, avoid = [], clear = TRAFFIC.respawnClear, occupied = []) {
  for (let tries = 0; tries < 60; tries++) {
    const edge = graph.edges[Math.floor(random() * graph.edges.length)];
    const car = { edge: edge.id, forward: random() < 0.5, s: random() * edge.length * 0.6, speed: 0 };
    const pose = carPose(graph, car);
    const nearest = avoid.length ? Math.min(...avoid.map(point => Math.hypot(point.x - pose.x, point.z - pose.z))) : Infinity;
    const roomy = occupied.every(other => Math.hypot(other.x - pose.x, other.z - pose.z) >= 12);
    if (roomy && nearest >= clear && (tries >= 40 || !avoid.length || nearest <= clear + 150)) return car;
  }
  const edge = graph.edges[Math.floor(random() * graph.edges.length)];
  return { edge: edge.id, forward: true, s: 0, speed: 0 };
}

/** `count` cars spread over the network, none right next to `avoid` points (the player). */
export function createTraffic(graph, count, seed = 7, avoid = []) {
  const random = makeRandom(seed);
  const cars = [];
  if (!graph.edges.length) return { cars, random };
  for (let i = 0; i < count; i++) {
    const occupied = cars.map(other => carPose(graph, other));
    cars.push({ ...spawn(graph, random, avoid, 25, occupied), id: i, paint: i % 6 });
  }
  return { cars, random };
}

/**
 * Distance to the nearest thing in this car's lane ahead (another car, the
 * player, the player's car), or Infinity. Obstacles are city-local points.
 */
export function gapAhead(graph, car, others, obstacles = []) {
  const pose = carPose(graph, car);
  let best = Infinity;
  const consider = (x, z, radius) => {
    const rx = x - pose.x, rz = z - pose.z;
    const ahead = rx * pose.dx + rz * pose.dz;
    const side = Math.abs(rx * pose.dz - rz * pose.dx);
    if (ahead > 0 && ahead < TRAFFIC.lookAhead && side < 1.3 + radius) best = Math.min(best, ahead - radius);
  };
  for (const other of others) {
    if (other === car) continue;
    const o = carPose(graph, other);
    // Only cars heading roughly our way count as "the car ahead"; oncoming ones are in the other lane.
    if (o.dx * pose.dx + o.dz * pose.dz < 0.2) continue;
    consider(o.x, o.z, TRAFFIC.carLength / 2);
  }
  for (const obstacle of obstacles) consider(obstacle.x, obstacle.z, obstacle.radius ?? TRAFFIC.playerRadius);
  return best;
}

/**
 * Advance every car by `seconds`. `obstacles` are city-local points the
 * traffic must not hit (the player, the player's car). Returns a new state.
 */
export function stepTraffic(graph, traffic, seconds, obstacles = []) {
  const dt = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.1)) : 0;
  if (!dt || !graph.edges.length) return traffic;
  const { random } = traffic;
  const holders = junctionHolders(graph, traffic.cars);
  const cars = traffic.cars.map(car => {
    const edge = graph.edges[car.edge];
    let target = CRUISE[edge.kind] ?? 8;
    const remaining = edge.length - car.s;
    const junction = endNode(graph, car);
    if (junction.edges.length >= 3) {
      // Ease off approaching a junction where roads meet…
      if (remaining < TRAFFIC.junctionSlowAt) target = Math.min(target, TRAFFIC.junctionSpeed);
      // …and wait at the line while someone else is crossing it.
      const busy = [...(holders.get(junction.key) ?? [])].some(id => id !== car.id);
      if (busy && remaining >= TRAFFIC.junctionBox && remaining < TRAFFIC.junctionWait) {
        target = 0;
      }
    }
    const gap = gapAhead(graph, car, traffic.cars, obstacles) - TRAFFIC.carLength / 2 - TRAFFIC.gap;
    if (gap < 0) target = 0;
    else if (gap < 10) target = Math.min(target, gap * 0.9);
    const speed = car.speed < target ? Math.min(target, car.speed + TRAFFIC.accel * dt) : Math.max(target, car.speed - TRAFFIC.brake * dt);
    let next = { ...car, speed, s: car.s + speed * dt };
    // Entering a junction box claims the junction; if someone got there first, stop at the line.
    if (junction.edges.length >= 3 && remaining >= TRAFFIC.junctionBox && edge.length - next.s < TRAFFIC.junctionBox) {
      const claimed = holders.get(junction.key) ?? new Set();
      if ([...claimed].some(id => id !== car.id)) next = { ...next, s: edge.length - TRAFFIC.junctionBox, speed: 0 };
      else { claimed.add(car.id); holders.set(junction.key, claimed); }
    }
    while (next.s >= graph.edges[next.edge].length) {
      const over = next.s - graph.edges[next.edge].length;
      const turn = nextEdge(graph, next, random);
      if (!turn) {
        const occupied = traffic.cars.filter(other => other.id !== car.id).map(other => carPose(graph, other));
        next = { ...next, ...spawn(graph, random, obstacles, TRAFFIC.respawnClear, occupied), speed: 0 };
        break;
      }
      next = { ...next, ...turn, s: over };
    }
    return next;
  });
  return { ...traffic, cars };
}

/** Render data: city-local pose and paint index for every car. */
export function trafficPoses(graph, traffic) {
  return traffic.cars.map(car => ({ id: car.id, paint: car.paint, speed: car.speed, ...carPose(graph, car) }));
}
