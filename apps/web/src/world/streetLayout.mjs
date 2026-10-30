/**
 * Metres; both the rendered cars and pedestrian collisions use these placements.
 * Each family car sits on its own driveway, nose toward the street, so the
 * 4.2 m road stays clear for driving and nobody parks in the lane.
 */
export const DRIVEWAY_Z = 0;
export const PARKED_CARS = Object.freeze([
  Object.freeze({ x: -5.9, z: DRIVEWAY_Z, rotation: Math.PI / 2 }),
  Object.freeze({ x: 5.9, z: DRIVEWAY_Z, rotation: -Math.PI / 2 }),
]);
export const CAR_HALF_WIDTH = 0.78;
export const CAR_HALF_LENGTH = 1.85;
export const STREET_LIGHTS = Object.freeze([
  Object.freeze({ x: -2.65, z: 2.8 }),
  Object.freeze({ x: 2.65, z: 7.8 }),
  Object.freeze({ x: -2.65, z: -3.5 }),
]);
