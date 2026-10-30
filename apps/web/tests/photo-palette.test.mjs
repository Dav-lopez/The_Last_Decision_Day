import test from 'node:test';
import assert from 'node:assert/strict';
import { describe, extractPalette, hexToRgb, houseStyleFrom, readHouseStyle, roleForMaterial, writeHouseStyle } from '../src/world/photoPalette.mjs';

/** A fake photo: sky on top, a yellow house front, a dark roof band, a red door. */
function photo() {
  const w = 40; const h = 40; const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const colour = y < 8 ? [150, 200, 245]           // sky
      : y < 14 ? [52, 48, 50]                          // roof
      : x >= 18 && x < 23 && y >= 26 ? [170, 30, 40]   // door
      : [222, 196, 110];                               // siding
    px.set([...colour, 255], (y * w + x) * 4);
  }
  return px;
}

test('a photo becomes a palette sorted by how much of the picture each colour covers', () => {
  const palette = extractPalette(photo(), 5);
  assert.equal(palette.length, 4, "four distinct colours, four clusters");
  for (let i = 1; i < palette.length; i++) assert.ok(palette[i - 1].share >= palette[i].share);
  assert.ok(Math.abs(palette.reduce((s, c) => s + c.share, 0) - 1) < 1e-9);
  const near = (hex, rgb) => { const c = hexToRgb(hex); return c.every((v, i) => Math.abs(v - rgb[i]) < 12); };
  assert.ok(near(palette[0].hex, [222, 196, 110]), 'siding dominates');
  assert.ok(palette.some(c => near(c.hex, [170, 30, 40])), 'the small red door survives');
});

test('the palette paints walls, roof, door and trim sensibly', () => {
  const style = houseStyleFrom(extractPalette(photo(), 5));
  const rgb = role => hexToRgb(style[role]);
  assert.ok(Math.abs(rgb('walls')[0] - 222) < 12, 'walls are the siding, not the sky');
  assert.ok(describe(rgb('roof')).lightness < 0.25, 'roof is the dark band');
  assert.ok(describe(rgb('door')).saturation > 0.6 && rgb('door')[0] > 140, 'door is the red');
  assert.ok(describe(rgb('trim')).lightness > 0.7, 'trim is light');
  assert.ok(describe(rgb('interior')).lightness > describe(rgb('walls')).lightness, 'inside is paler');
  assert.notDeepEqual(houseStyleFrom(extractPalette(photo(), 5), 1).walls, style.walls, 'variants try other wall colours');
});

test('odd input: empty, transparent or single-colour photos never crash', () => {
  assert.deepEqual(extractPalette([]), []);
  assert.deepEqual(extractPalette([10, 20, 30, 0]), []);
  assert.equal(houseStyleFrom([]), null);
  const flat = houseStyleFrom(extractPalette(new Uint8Array(400).fill(128), 6));
  assert.ok(flat && hexToRgb(flat.walls) && hexToRgb(flat.roof) && hexToRgb(flat.door));
});

test('the style is saved per character and ignored if tampered with', () => {
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  const style = houseStyleFrom(extractPalette(photo(), 5));
  writeHouseStyle('c1', style, storage);
  assert.deepEqual(readHouseStyle('c1', storage).walls, style.walls);
  assert.equal(readHouseStyle('c2', storage), null);
  store.set('tld-house-style-v1:c1', JSON.stringify({ ...style, roof: 'url(javascript:1)' }));
  assert.equal(readHouseStyle('c1', storage), null);
  writeHouseStyle('c1', null, storage);
  assert.equal(store.size, 0);
  assert.equal(readHouseStyle('c1', { getItem() { throw new Error('blocked'); } }), null);
});

test('house surfaces map to paint roles for both the procedural and the authored house', () => {
  assert.equal(roleForMaterial('warm ivory siding'), 'walls');
  assert.equal(roleForMaterial('Ivory horizontal siding'), 'walls');
  assert.equal(roleForMaterial('Shingle roof'), 'roof');
  assert.equal(roleForMaterial('roof'), 'roof');
  assert.equal(roleForMaterial('Stained wood door'), 'door');
  assert.equal(roleForMaterial('porch front door'), 'door');
  assert.equal(roleForMaterial('garage panel'), null);
  assert.equal(roleForMaterial('Painted white trim'), 'trim');
  assert.equal(roleForMaterial('Blue window glass'), null);
  assert.equal(roleForMaterial('Brick foundation'), null);
});
