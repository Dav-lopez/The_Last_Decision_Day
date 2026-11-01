/**
 * GPS: the shortest drive along the road network from where you are to a
 * waypoint, as a polyline for the minimap and big map. City-local metres,
 * using the same graph as the traffic (cityTraffic.buildRoadGraph).
 */

/** Closest point on any edge to (x, z): { edge, s, x, z, distance }. */
export function nearestOnRoads(graph, x, z) {
  let best = null;
  for (const edge of graph.edges) {
    for (let i = 1; i < edge.points.length; i++) {
      const [ax, az] = edge.points[i - 1], [bx, bz] = edge.points[i];
      const vx = bx - ax, vz = bz - az;
      const len2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2));
      const px = ax + vx * t, pz = az + vz * t;
      const distance = Math.hypot(x - px, z - pz);
      if (!best || distance < best.distance) best = { edge: edge.id, s: edge.cumulative[i - 1] + Math.sqrt(len2) * t, x: px, z: pz, distance };
    }
  }
  return best;
}

/** The part of an edge's polyline between arc lengths a and b (either order). */
function slice(edge, a, b) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const out = [];
  const at = s => {
    const c = edge.cumulative;
    let i = 1;
    while (i < c.length - 1 && c[i] < s) i++;
    const t = (s - c[i - 1]) / ((c[i] - c[i - 1]) || 1);
    const [ax, az] = edge.points[i - 1], [bx, bz] = edge.points[i];
    return [ax + (bx - ax) * t, az + (bz - az) * t];
  };
  out.push(at(lo));
  edge.cumulative.forEach((c, i) => { if (c > lo && c < hi) out.push([...edge.points[i]]); });
  out.push(at(hi));
  return a <= b ? out : out.reverse();
}

/**
 * Shortest road route between two points (Dijkstra over junctions).
 * Returns { points: [[x, z], …], length } starting and ending on the road
 * nearest each point, or null when either is far from any road.
 */
export function routeBetween(graph, from, to, maxSnap = 60) {
  if (!graph?.edges?.length) return null;
  const a = nearestOnRoads(graph, from.x, from.z), b = nearestOnRoads(graph, to.x, to.z);
  if (!a || !b || a.distance > maxSnap || b.distance > maxSnap) return null;
  if (a.edge === b.edge) {
    const points = slice(graph.edges[a.edge], a.s, b.s);
    return { points, length: Math.abs(b.s - a.s) };
  }
  const edgeA = graph.edges[a.edge], edgeB = graph.edges[b.edge];
  // Start: the two ends of our edge, at their distances along it.
  const dist = new Map(), prev = new Map();
  dist.set(edgeA.from, a.s); prev.set(edgeA.from, { start: true, node: edgeA.from });
  dist.set(edgeA.to, edgeA.length - a.s); prev.set(edgeA.to, { start: true, node: edgeA.to });
  const done = new Set();
  for (;;) {
    let current = null, currentDist = Infinity;
    for (const [node, d] of dist) if (!done.has(node) && d < currentDist) { current = node; currentDist = d; }
    if (current === null) break;
    done.add(current);
    for (const id of graph.nodes.get(current).edges) {
      if (id === a.edge) continue;
      const edge = graph.edges[id];
      const other = edge.from === current ? edge.to : edge.from;
      const d = currentDist + edge.length;
      if (d < (dist.get(other) ?? Infinity)) { dist.set(other, d); prev.set(other, { edge: id, node: current }); }
    }
  }
  // Finish: whichever end of the target edge is cheaper.
  const viaFrom = (dist.get(edgeB.from) ?? Infinity) + b.s;
  const viaTo = (dist.get(edgeB.to) ?? Infinity) + (edgeB.length - b.s);
  if (!Number.isFinite(Math.min(viaFrom, viaTo))) return null;
  const endNode = viaFrom <= viaTo ? edgeB.from : edgeB.to;
  // Walk back from the end node to the start.
  const chain = [];
  let node = endNode;
  while (!prev.get(node)?.start) {
    const step = prev.get(node);
    chain.unshift({ edge: step.edge, from: step.node, to: node });
    node = step.node;
  }
  const points = [];
  const push = list => { for (const p of list) { const last = points[points.length - 1]; if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 1e-6) points.push(p); } };
  push(slice(edgeA, a.s, node === edgeA.from ? 0 : edgeA.length));
  for (const step of chain) {
    const edge = graph.edges[step.edge];
    push(edge.from === step.from ? slice(edge, 0, edge.length) : slice(edge, edge.length, 0));
  }
  push(slice(edgeB, endNode === edgeB.from ? 0 : edgeB.length, b.s));
  return { points, length: Math.min(viaFrom, viaTo) };
}

/** Length of a polyline. */
export function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return total;
}

/** "350 m" / "1.2 km" for the route readout. */
export function formatDistance(metres) {
  if (!Number.isFinite(metres)) return '';
  return metres < 950 ? `${Math.max(10, Math.round(metres / 10) * 10)} m` : `${(metres / 1000).toFixed(1)} km`;
}
