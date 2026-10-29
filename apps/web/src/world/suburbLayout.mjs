/** Stable placement helpers for the playable American suburban street. */
export const HOUSE_SITES = Object.freeze([
  Object.freeze({ x: -8.4, z: -5.05, roadSide: 1 }),
  Object.freeze({ x: 8.4, z: -5.05, roadSide: -1 }),
]);
export const STREET_HALF_WIDTH = 2.1;
export const SIDEWALK_OFFSET = 0.4;
export const SIDEWALK_WIDTH = 0.65;

/** Road-adjacent pedestrian furniture stays outside the driving lane. */
export function streetFurniture(site) {
  const roadEdgeX = site.roadSide === 1 ? -STREET_HALF_WIDTH : STREET_HALF_WIDTH;
  return {
    sidewalkX: roadEdgeX - site.roadSide * SIDEWALK_OFFSET,
    mailboxX: roadEdgeX - site.roadSide * 1.05,
    mailboxZ: site.z + 1.6,
  };
}
