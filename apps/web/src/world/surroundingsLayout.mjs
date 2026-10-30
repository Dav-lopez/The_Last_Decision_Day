/**
 * Scenery beyond the playable 24 m square, so the street sits in a town that
 * reaches the horizon instead of floating in the sky. Pure, deterministic data:
 * the road and sidewalks continue, houses line them, trees and low hills fill
 * the distance, and fences/barricades mark where the playable area ends.
 * Nothing here is walkable or collidable; the player stays inside WORLD_RADIUS.
 */
export const PLAYABLE_HALF = 12;
export const ROAD_HALF = 2.1;
export const SIDEWALK_CENTER = 2.5;
export const SIDEWALK_WIDTH = 0.65;
export const ROAD_REACH = 170;
export const GROUND_SIZE = 480;
const FENCE_LINE = 11.8;

/** Seeded generator so every player sees the same town. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Houses face the road from both sides, north of the street and behind the school. */
export const DISTANT_HOUSES = Object.freeze((() => {
  const next = random(17);
  const houses = [];
  for (const direction of [1, -1]) {
    for (let distance = 19; distance <= 135; distance += 13) {
      for (const side of [-1, 1]) {
        houses.push(Object.freeze({
          x: side * (9 + next() * 1.5),
          z: direction * (distance + next() * 3),
          // House fronts are +Z at rotation 0; turn them to face the road.
          rotation: side < 0 ? Math.PI / 2 : -Math.PI / 2,
          width: 6 + next() * 2.5,
          depth: 7 + next() * 2,
          height: 3 + next() * 1.4,
          tone: Math.floor(next() * 4),
        }));
      }
    }
  }
  return houses;
})());

function houseFootprint(house) {
  // Turned a quarter, the house's depth runs along X.
  return { minX: house.x - house.depth / 2, maxX: house.x + house.depth / 2, minZ: house.z - house.width / 2, maxZ: house.z + house.width / 2 };
}
export const HOUSE_FOOTPRINTS = Object.freeze(DISTANT_HOUSES.map(houseFootprint));

const insideAny = (x, z, areas, margin) => areas.some(area =>
  x > area.minX - margin && x < area.maxX + margin && z > area.minZ - margin && z < area.maxZ + margin);

/** Trees scattered through the countryside, kept off the road, the lots and the playable square. */
export const DISTANT_TREES = Object.freeze((() => {
  const next = random(91);
  const trees = [];
  for (let attempt = 0; trees.length < 240 && attempt < 4000; attempt++) {
    const angle = next() * Math.PI * 2;
    const radius = 15 + Math.sqrt(next()) * 165;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (Math.abs(x) < 6.5) continue;                                     // road + sidewalks + verge
    if (Math.abs(x) < PLAYABLE_HALF + 2 && Math.abs(z) < PLAYABLE_HALF + 2) continue;
    if (insideAny(x, z, HOUSE_FOOTPRINTS, 1.5)) continue;
    trees.push(Object.freeze({ x, z, scale: 0.8 + next() * 0.7, tone: Math.floor(next() * 3) }));
  }
  return trees;
})());

/** Low, wide hills well beyond the town, softened by fog. */
export const HILLS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7].map(index => {
  const angle = index * Math.PI / 4 + 0.3;
  const distance = 200 + (index % 3) * 18;
  return Object.freeze({ x: Math.cos(angle) * distance, z: Math.sin(angle) * distance, radius: 45 + (index % 4) * 8, height: 16 + (index % 3) * 6 });
}));

/**
 * Picket fences along the playable square's sides and back, and a "road
 * closed" barricade across the road and sidewalks at the north edge.
 */
export const FENCES = Object.freeze([
  Object.freeze({ from: { x: -FENCE_LINE, z: -FENCE_LINE }, to: { x: -FENCE_LINE, z: FENCE_LINE } }),
  Object.freeze({ from: { x: FENCE_LINE, z: -FENCE_LINE }, to: { x: FENCE_LINE, z: FENCE_LINE } }),
  Object.freeze({ from: { x: -FENCE_LINE, z: FENCE_LINE }, to: { x: -3.1, z: FENCE_LINE } }),
  Object.freeze({ from: { x: 3.1, z: FENCE_LINE }, to: { x: FENCE_LINE, z: FENCE_LINE } }),
  Object.freeze({ from: { x: -FENCE_LINE, z: -FENCE_LINE }, to: { x: -4.4, z: -FENCE_LINE } }),
  Object.freeze({ from: { x: 4.4, z: -FENCE_LINE }, to: { x: FENCE_LINE, z: -FENCE_LINE } }),
]);
export const ROAD_BARRICADE = Object.freeze({ z: FENCE_LINE - 0.1, halfWidth: SIDEWALK_CENTER + SIDEWALK_WIDTH / 2 + 0.1 });
