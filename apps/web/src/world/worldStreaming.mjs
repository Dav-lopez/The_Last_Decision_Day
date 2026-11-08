/**
 * Streaming the world (open-world 17c): only the place you're near is drawn.
 *
 * Maple Street and downtown are ~370 m of open road apart. Drawing downtown's hundreds of buildings, lamps and
 * facades from Maple Street (or the whole town from downtown) costs draw calls on every frame for scenery that the
 * fog hides anyway, which phones feel most. Each place is shown when you come within `showWithin` metres of it and
 * hidden again once you're `hideBeyond` away (the gap stops it flickering at the edge). The open road itself is
 * always drawn. Pure: the scene applies the result.
 */
import { CITY_ORIGIN } from './cityLayout.mjs';
import { PLAYABLE_HALF } from './surroundingsLayout.mjs';

export const STREAMING = Object.freeze({
  showWithin: 240,
  hideBeyond: 270,
  /** The playable Maple Street square (the home and school interiors sit just south of it). */
  town: Object.freeze({ minX: -PLAYABLE_HALF, maxX: PLAYABLE_HALF, minZ: -PLAYABLE_HALF, maxZ: PLAYABLE_HALF }),
  /** Downtown's ground reaches this far past its map data. */
  cityMargin: 40,
});

/** Distance (m, flat) from a point to a rectangle; 0 inside. */
export function rectDistance(rect, point) {
  const dx = Math.max(rect.minX - point.x, 0, point.x - rect.maxX);
  const dz = Math.max(rect.minZ - point.z, 0, point.z - rect.maxZ);
  return Math.hypot(dx, dz);
}

/** Downtown's footprint in world space from its map half-size. */
export function cityRect(halfSize, margin = STREAMING.cityMargin) {
  const [hx, hz] = halfSize;
  return { minX: CITY_ORIGIN.x - hx - margin, maxX: CITY_ORIGIN.x + hx + margin, minZ: CITY_ORIGIN.z - hz - margin, maxZ: CITY_ORIGIN.z + hz + margin };
}

function near(shown, distance) {
  return distance < (shown ? STREAMING.hideBeyond : STREAMING.showWithin);
}

/**
 * Which places to draw. `previous` is the last answer ({ town, city }), `point` where you are, `city` downtown's
 * rectangle (null before it's built). `place` is where the game thinks you are: being in a place always shows it,
 * so a bus, taxi or fade that drops you there never arrives in an empty world.
 */
export function streamVisibility(previous, point, city, place) {
  const town = place === 'street' || place === 'home' || place === 'school' ? true : near(previous?.town ?? true, rectDistance(STREAMING.town, point));
  const downtown = !city ? false : place === 'city' ? true : near(previous?.city ?? true, rectDistance(city, point));
  // Never both hidden: if you're somewhere neither covers, keep what you had.
  if (!town && !downtown) return { town: previous?.town ?? true, city: previous?.city ?? Boolean(city) };
  return { town, city: downtown };
}
