/** World-space layout for the first playable American suburban street. */
export const HOUSE_SITES = Object.freeze([
  Object.freeze({ x: -8.4, z: -5.05, roadSide: 1 }),
  Object.freeze({ x: 8.4, z: -5.05, roadSide: -1 }),
]);

export const STREET_HALF_WIDTH = 2.1;
export const HOUSE_HALF_WIDTH = 2.1;
export const ROOF_HALF_SPAN = 2.45;
export const ROOF_RISE = 1.2;

/** A driveway ends at the existing house wall and starts at the road edge. */
export function houseStreetFeatures(site) {
  const streetWallX = site.x + site.roadSide * HOUSE_HALF_WIDTH;
  const roadEdgeX = site.roadSide === 1 ? -STREET_HALF_WIDTH : STREET_HALF_WIDTH;
  return {
    streetWallX,
    garageFacadeX: streetWallX + site.roadSide * 0.075,
    drivewayX: (streetWallX + roadEdgeX) / 2,
    drivewayLength: Math.abs(streetWallX - roadEdgeX),
    sidewalkX: roadEdgeX - site.roadSide * 0.4,
  };
}

export function gableRoofGeometry() {
  return {
    panelWidth: Math.hypot(ROOF_HALF_SPAN, ROOF_RISE),
    pitchRadians: Math.atan2(ROOF_RISE, ROOF_HALF_SPAN),
    panelCenterY: 3.6 + ROOF_RISE / 2,
    ridgeY: 3.6 + ROOF_RISE,
  };
}
