/**
 * Downtown regulars: three people who stand at the same downtown spots every day
 * (the bus stop, the Central Park pitch, the fire station door) and can be talked to.
 * Their exact spots come from the real street data, so the scene places them once the
 * city has loaded; this module does the placing (pure and deterministic) and keeps
 * them clear of the bus-stop, workplace and pitch prompts so E always does one thing.
 * Placed people use the same record shape as Maple Street's standing neighbours, so
 * the scene renders them with the same rigged-people code.
 */
import { personHeading } from './npcLayout.mjs';

const H = hours => hours * 60;

/** Who stands where, and when. `resident` is the scene's id for their body. */
export const DOWNTOWN_REGULARS = Object.freeze([
  Object.freeze({
    npc: 'priya', resident: 'downtown-guide', anchor: 'stop', from: H(8), until: H(19),
    look: Object.freeze({ body: 'female', skin: 'brown', hair: 'black', hairStyle: 'long', top: 'hoodie', outfit: 'sky', bottom: 'jeans', bottomColor: 'denim', shoes: 'sneakers', shoeColor: 'white' }),
  }),
  Object.freeze({
    npc: 'dee', resident: 'downtown-coach', anchor: 'pitch', from: H(9), until: H(20),
    look: Object.freeze({ body: 'female', skin: 'deep', hair: 'dark', hairStyle: 'buns', top: 'tshirt', outfit: 'green', bottom: 'leggings', bottomColor: 'black', shoes: 'sneakers', shoeColor: 'red' }),
  }),
  Object.freeze({
    npc: 'brooks', resident: 'downtown-captain', anchor: 'firefighter', from: H(7), until: H(21),
    // The fire service's own uniform (see careers.mjs), with a captain's beard.
    look: Object.freeze({ body: 'male', skin: 'light', hair: 'gray', hairStyle: 'buzzed', facialHair: 'beard', top: 'tshirt', outfit: 'navy', bottom: 'trousers', bottomColor: 'tan', shoes: 'boots', shoeColor: 'black' }),
  }),
]);

/** Prompts these spots must stay outside of (metres from the anchor they belong to). */
export const KEEP_CLEAR = Object.freeze({ stop: 1.5, workplace: 2, pitchMargin: 2 });
/** How far in front of a regular the player stands to talk. */
export const TALK_GAP = 0.9;
const STAND_DISTANCE = 3.1;

/** Road kinds cars drive on (footways, paths, cycleways and steps are fine to stand on). */
const TRAFFIC_ROADS = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service']);

/**
 * Whether local point (x, z) is clear of every traffic road's carriageway (half its width plus
 * `margin` from the centre line), so nobody is placed where the downtown cars drive.
 */
export function offTraffic(roads, x, z, margin = 0.8) {
  for (const road of roads ?? []) {
    if (!TRAFFIC_ROADS.has(road.kind) || !Array.isArray(road.points)) continue;
    const reach = (Number.isFinite(road.width) ? road.width : 6) / 2 + margin;
    for (let i = 0; i + 1 < road.points.length; i++) {
      const [ax, az] = road.points[i];
      const [bx, bz] = road.points[i + 1];
      const dx = bx - ax; const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(x - ax - dx * t, z - az - dz * t) < reach) return false;
    }
  }
  return true;
}

const finite = point => Boolean(point) && Number.isFinite(point.x) && Number.isFinite(point.z);
const unit = (x, z) => { const length = Math.hypot(x, z) || 1; return { x: x / length, z: z / length }; };

/**
 * Stands someone about `STAND_DISTANCE` (then 1.5 m and 3 m further) from `anchor` (a walkable spot: the bus stop,
 * a workplace door, the pitch-side), preferring direction `prefer`, then trying a ring
 * of other directions. The talk spot is TALK_GAP towards the anchor, so the player is
 * placed on the walkable side. Both points must be free; null when nothing fits.
 */
export function standNear(anchor, prefer, isFree, distance = STAND_DISTANCE) {
  if (!finite(anchor)) return null;
  const free = typeof isFree === 'function' ? isFree : () => true;
  const base = Math.atan2(prefer?.z ?? 1, prefer?.x ?? 0);
  // A little further out each ring, if the near ring is all wall or road.
  for (const reach of [distance, distance + 1.5, distance + 3]) {
    for (let i = 0; i < 24; i++) {
      // 0, +15°, -15°, +30°, -30°… around the preferred direction.
      const step = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
      const angle = base + step * (Math.PI / 12);
      const at = { x: anchor.x + Math.cos(angle) * reach, z: anchor.z + Math.sin(angle) * reach };
      const back = unit(anchor.x - at.x, anchor.z - at.z);
      const talk = { x: at.x + back.x * TALK_GAP, z: at.z + back.z * TALK_GAP };
      if (free(at.x, at.z) && free(talk.x, talk.z)) return { at, talk, facing: personHeading(back.x, back.z) };
    }
  }
  return null;
}

/**
 * Places the downtown regulars from the loaded city: `stop` (world position with the
 * kerb direction dx/dz and awayX/awayZ pointing off the road), `pitch` ({ x, z,
 * halfLength, halfWidth }), `doors` (career id → world door spot) and `isFree(x, z)`
 * (world; false inside buildings and on roads, see offTraffic). Returns neighbour-shaped records
 * ({ id, npc, look, route: stand, speed, startOffset, from, until, talk, solo }); anyone
 * whose landmark is missing is left out.
 */
export function placeDowntownRegulars({ stop, pitch, doors, isFree } = {}) {
  const placed = [];
  for (const regular of DOWNTOWN_REGULARS) {
    let spot = null;
    if (regular.anchor === 'stop' && finite(stop)) {
      // Along the kerb from the shelter, a little back from the road.
      const along = unit(stop.dx ?? 1, stop.dz ?? 0);
      const away = unit(stop.awayX ?? 0, stop.awayZ ?? 0);
      spot = standNear(stop, { x: along.x + away.x * 0.25, z: along.z + away.z * 0.25 }, isFree);
    } else if (regular.anchor === 'pitch' && finite(pitch)) {
      // On the touchline side, outside the cage and beyond where "Start a match" shows.
      const side = { x: pitch.x, z: pitch.z + pitch.halfWidth + KEEP_CLEAR.pitchMargin + 2.6 };
      const found = standNear(side, { x: 0, z: -1 }, isFree, 1.2);
      // Coach watches the pitch rather than the path (she turns to you when you talk).
      if (found) spot = { ...found, facing: personHeading(0, pitch.z - found.at.z) };
    } else if (doors && typeof doors.get === 'function' && finite(doors.get(regular.anchor))) {
      const door = doors.get(regular.anchor);
      spot = standNear(door, { x: 1, z: 0 }, isFree);
    }
    if (!spot) continue;
    placed.push(Object.freeze({
      id: regular.resident, npc: regular.npc, look: regular.look,
      route: Object.freeze({ kind: 'stand', at: Object.freeze(spot.at), facing: spot.facing }),
      speed: 0, startOffset: 0, from: regular.from, until: regular.until,
      talk: Object.freeze(spot.talk),
      // Standing alone: they idle rather than chat with nobody.
      solo: true,
    }));
  }
  return placed;
}

/** Whether a placed regular is downtown at `minute` (game minutes since midnight). */
export function regularIsOut(regular, minute) {
  return Number.isFinite(minute) && minute >= regular.from && minute < regular.until;
}

/** The talk spot of the nearest regular who is out now (nearest to `from` when given), or null. */
export function downtownTalkSpot(placed, minute, from = null) {
  let best = null;
  for (const regular of placed ?? []) {
    if (!regularIsOut(regular, minute)) continue;
    const distance = finite(from) ? Math.hypot(regular.talk.x - from.x, regular.talk.z - from.z) : 0;
    if (!best || distance < best.distance) best = { id: regular.npc, x: regular.talk.x, z: regular.talk.z, distance };
  }
  return best && { id: best.id, x: best.x, z: best.z };
}
