/**
 * The world is built at 1 unit = 1 metre (2.05 m doors, a 3.6 m sedan, 3.1 m
 * walls), so the player is an average adult height, not a 2.2 m giant.
 */
export const HUMAN_HEIGHT = 1.75;

/** The procedural player faces -Z. Normalize imported +Z glTF humans to that convention. */
export function normalizeRiggedVisual(root, targetHeight = HUMAN_HEIGHT) {
  root.rotation.y = Math.PI;
  const { min, max } = root.getHierarchyBoundingVectors(true);
  const height = max.y - min.y;
  if (![min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite) ||
      height < 0.1 || height > 100 || !Number.isFinite(targetHeight) || targetHeight <= 0) {
    throw new Error('Character asset has invalid bounds or height.');
  }
  const scale = targetHeight / height;
  root.scaling.setAll(scale);
  root.position.set(-(min.x + max.x) / 2 * scale, -min.y * scale, -(min.z + max.z) / 2 * scale);
}

/** Babylon rotates -Z toward -X for a positive Y angle. Match actual displacement. */
export function movementHeading(dx, dz) {
  if (!Number.isFinite(dx) || !Number.isFinite(dz) || Math.hypot(dx, dz) < 1e-8) return 0;
  return Math.atan2(-dx, -dz);
}
