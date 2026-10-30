/**
 * Placing a player's own 3D scan (Gaussian splat or glTF) on the lawn across
 * from home: scale it to fit, stand it on the grass, keep it off the path.
 */
export const SCAN_SPOT = Object.freeze({ x: 9.6, z: 5.6, maxSize: 3 });
export const SCAN_FORMATS = Object.freeze(['.spz', '.ply', '.splat', '.sog', '.glb', '.gltf']);

export function scanFormat(fileName) {
  const match = /\.[a-z0-9]+$/i.exec(String(fileName ?? ''));
  const ext = match ? match[0].toLowerCase() : '';
  return SCAN_FORMATS.includes(ext) ? ext : null;
}

/**
 * From a bounding box ({min, max} with x/y/z) to the scale and position that
 * fit the scan inside SCAN_SPOT.maxSize, centred on the spot, resting on y = 0.
 */
export function fitScan(bounds, spot = SCAN_SPOT) {
  const size = ['x', 'y', 'z'].map(axis => bounds.max[axis] - bounds.min[axis]);
  const largest = Math.max(...size);
  if (!(largest > 0) || !size.every(Number.isFinite)) return null;
  const scale = spot.maxSize / largest;
  const cx = (bounds.min.x + bounds.max.x) / 2; const cz = (bounds.min.z + bounds.max.z) / 2;
  return { scale, position: { x: spot.x - cx * scale, y: -bounds.min.y * scale, z: spot.z - cz * scale } };
}
