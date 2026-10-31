/**
 * Deterministic, seamless RGBA tangent-space normal tile for subtle skin pores.
 * No external image download, randomness, or per-frame allocations are needed.
 * This is microdetail only: it does not replace anatomical geometry or authored maps.
 */
const wrap = (n, period) => ((n % period) + period) % period;
const smooth = t => t * t * (3 - 2 * t);

function lattice(x, y, period) {
  const a = Math.imul(wrap(x, period) + 1, 0x9e3779b1);
  const b = Math.imul(wrap(y, period) + 1, 0x85ebca6b);
  let h = a ^ b ^ 0x27d4eb2f;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return (h >>> 0) / 0xffffffff;
}

function periodicNoise(x, y, period, size) {
  const u = wrap(x, size) * period / size;
  const v = wrap(y, size) * period / size;
  const ix = Math.floor(u), iy = Math.floor(v);
  const tx = smooth(u - ix), ty = smooth(v - iy);
  const top = lattice(ix, iy, period) * (1 - tx) + lattice(ix + 1, iy, period) * tx;
  const bottom = lattice(ix, iy + 1, period) * (1 - tx) + lattice(ix + 1, iy + 1, period) * tx;
  return top * (1 - ty) + bottom * ty;
}

/** Return a bounded tile; caller owns the buffer and may upload it as a linear normal map. */
export function skinMicroNormalMap(size = 64) {
  if (!Number.isInteger(size) || size < 16 || size > 256 || (size & (size - 1)) !== 0) {
    throw new RangeError('Skin normal tile size must be a power of two between 16 and 256');
  }
  const heights = new Float32Array(size * size);
  const low = size / 8, mid = size / 4, high = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    heights[y * size + x] = 0.52 * periodicNoise(x, y, low, size)
      + 0.33 * periodicNoise(x, y, mid, size)
      + 0.15 * periodicNoise(x, y, high, size);
  }
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => heights[wrap(y, size) * size + wrap(x, size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // Central differences preserve continuity across the tile's wrap boundary.
    const dx = (at(x + 1, y) - at(x - 1, y)) * 0.25;
    const dy = (at(x, y + 1) - at(x, y - 1)) * 0.25;
    const length = Math.hypot(dx, dy, 1);
    const index = (y * size + x) * 4;
    data[index] = Math.round((1 - dx / length) * 127.5);
    data[index + 1] = Math.round((1 - dy / length) * 127.5);
    data[index + 2] = Math.round((1 + 1 / length) * 127.5);
    data[index + 3] = 255;
  }
  return data;
}
