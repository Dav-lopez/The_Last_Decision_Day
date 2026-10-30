/**
 * Street props placed from Poly Haven models (with procedural stand-ins until
 * the models are present). One table drives rendering and collision.
 * Rotation uses Babylon's Y convention: 0 faces +Z (toward the street/viewer).
 */
import { HOUSE_SITES } from './suburbLayout.mjs';
import { CAR_HALF_LENGTH, CAR_HALF_WIDTH } from './streetLayout.mjs';

export const PROP_TYPES = Object.freeze({
  // Real-world sizes: the world is 1 unit = 1 metre and the player is 1.75 m.
  // targetHeight/maxFootprint scale imported models; halfX/halfZ are the collision footprint.
  plant: Object.freeze({ targetHeight: 0.9, maxFootprint: 0.65, halfX: 0.3, halfZ: 0.3 }),
  bench: Object.freeze({ targetHeight: 0.85, maxFootprint: 1.6, halfX: 0.8, halfZ: 0.32 }),
  sofa: Object.freeze({ targetHeight: 0.85, maxFootprint: 2.1, halfX: 1.05, halfZ: 0.45 }),
  armchair: Object.freeze({ targetHeight: 0.95, maxFootprint: 0.9, halfX: 0.45, halfZ: 0.45 }),
  coffee_table: Object.freeze({ targetHeight: 0.45, maxFootprint: 1.1, halfX: 0.55, halfZ: 0.33 }),
  dining_chair: Object.freeze({ targetHeight: 0.95, maxFootprint: 0.55, halfX: 0.28, halfZ: 0.28 }),
  bed: Object.freeze({ targetHeight: 1.0, maxFootprint: 2.4, halfX: 0.85, halfZ: 1.2 }),
  floor_lamp: Object.freeze({ targetHeight: 1.6, maxFootprint: 0.45, halfX: 0.22, halfZ: 0.22 }),
  shelf: Object.freeze({ targetHeight: 1.8, maxFootprint: 1.45, halfX: 0.72, halfZ: 0.22 }),
});

const ENTRY_OFFSET = 0.85;
const PORCH_PLANT_SPREAD = 0.95;
const PORCH_PLANT_Z = -2.3;

export const PROP_SITES = Object.freeze([
  // Two potted plants flank each front porch.
  ...HOUSE_SITES.flatMap((site, house) => {
    const entryX = site.x + site.roadSide * ENTRY_OFFSET;
    return [-1, 1].map(side => Object.freeze({
      id: `porch-plant-${house}-${side < 0 ? 'left' : 'right'}`, type: 'plant',
      x: entryX + side * PORCH_PLANT_SPREAD, z: PORCH_PLANT_Z, rotation: 0,
    }));
  }),
  // Benches on the lawn either side of the school entrance, facing the street.
  Object.freeze({ id: 'school-bench-west', type: 'bench', x: -3.3, z: -6.15, rotation: 0 }),
  Object.freeze({ id: 'school-bench-east', type: 'bench', x: 3.3, z: -6.15, rotation: 0 }),
]);

/** Axis-aligned footprint of a placed prop; props use quarter-turn rotations only. */
export function propBlocker(site) {
  const { halfX, halfZ } = PROP_TYPES[site.type];
  const turned = Math.abs(Math.sin(site.rotation)) > 0.5;
  const hx = turned ? halfZ : halfX;
  const hz = turned ? halfX : halfZ;
  return Object.freeze({ id: site.id, minX: site.x - hx, maxX: site.x + hx, minZ: site.z - hz, maxZ: site.z + hz });
}

export const PROP_BLOCKERS = Object.freeze(PROP_SITES.map(propBlocker));

/**
 * Uniform scale for a model with bounding size [x, y, z] (any units): match the
 * target height, but never exceed the prop's footprint.
 */
export function propScale(type, size) {
  const spec = PROP_TYPES[type];
  const [x, y, z] = size ?? [];
  if (!spec || ![x, y, z].every(value => Number.isFinite(value) && value > 0)) return null;
  return Math.min(spec.targetHeight / y, spec.maxFootprint / Math.max(x, z));
}

/**
 * Fit an imported car to the parking footprint used by driving and collision:
 * its long axis along local Z, scaled so it is no longer or wider than the
 * sedan it replaces. `rotation` from the manifest flips a model facing backward.
 * Returns null for a model that wouldn't look like a car at that size.
 */
export function carFit(size, manualRotation = 0) {
  const [x, y, z] = size ?? [];
  if (![x, y, z].every(value => Number.isFinite(value) && value > 0)) return null;
  const length = Math.max(x, z);
  const width = Math.min(x, z);
  const scale = Math.min(2 * CAR_HALF_LENGTH / length, 2 * CAR_HALF_WIDTH / width);
  const height = y * scale;
  if (length / width < 1.6 || height < 1.0 || height > 2.2) return null;
  return { scale, rotation: (x > z ? Math.PI / 2 : 0) + (Number.isFinite(manualRotation) ? manualRotation : 0) };
}
