import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pointInRing, readCity } from '../src/world/cityLayout.mjs';
import {
  awningSpans, drawFacade, FACADE_STYLES, FACADE_TILE, facadeStyleFor, facadeVariant, litWindows, rooftopUnits, seeded, shade, windowGlow,
} from '../src/world/facadeDesign.mjs';

const CITY = new URL('../public/city/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('index.json', CITY), 'utf8'));
const city = readCity(JSON.parse(readFileSync(new URL(index.cities[0].file, CITY), 'utf8')));

test('real buildings get a style from what they are', () => {
  assert.equal(facadeStyleFor({ id: 1, kind: 'yes', name: 'Boulder County Courthouse', height: 12 }), 'stone');
  assert.equal(facadeStyleFor({ id: 1, kind: 'house', name: '', height: 7 }), 'house');
  assert.equal(facadeStyleFor({ id: 1, kind: 'yes', name: '', height: 30 }), 'modern');
  assert.equal(facadeStyleFor({ id: 3, kind: 'retail', name: '', height: 9 }), 'tan');
  assert.equal(facadeStyleFor({ id: 4, kind: 'retail', name: '', height: 9 }), 'brick');
  const used = new Set(city.buildings.map(facadeStyleFor));
  assert.ok(used.size >= 4, `downtown shows at least four styles (${[...used]})`);
});

test('every building varies its tint and window grid a little, the same way every time', () => {
  const variants = city.buildings.map(facadeVariant);
  assert.deepEqual(variants, city.buildings.map(facadeVariant), 'deterministic');
  for (const v of variants) {
    for (const channel of v.tint) assert.ok(channel > 0.8 && channel <= 1.08, `tint ${v.tint} stays close to the paint`);
    assert.ok(Number.isInteger(v.bayShift) && v.bayShift >= 0 && v.bayShift < FACADE_TILE.bays);
    assert.ok(v.parapet >= 0 && v.parapet <= 1);
    if (v.style === 'house') assert.equal(v.parapet, 0);
  }
  assert.ok(new Set(variants.map(v => v.tint.join())).size > city.buildings.length * 0.8, 'tints differ between buildings');
  assert.ok(new Set(variants.map(v => v.bayShift)).size === FACADE_TILE.bays, 'window grids start at different bays');
});

test('about two in five windows are lit after dark, with warm and cool lamps', () => {
  const grid = litWindows(9);
  assert.equal(grid.length, FACADE_TILE.floors);
  for (const row of grid) assert.equal(row.length, FACADE_TILE.bays);
  let lit = 0; let total = 0;
  for (let seed = 0; seed < 200; seed++) for (const row of litWindows(seed)) for (const w of row) { total++; if (w.lit) lit++; }
  assert.ok(lit / total > 0.3 && lit / total < 0.46, `lit share ${(lit / total).toFixed(2)}`);
  assert.deepEqual(litWindows(5), litWindows(5));
  assert.equal(litWindows(5, 0).flat().filter(w => w.lit).length, 0);
  assert.equal(litWindows(5, 1).flat().filter(w => w.lit).length, 16);
  const [warm, cool] = [windowGlow(1), windowGlow(0)].map(c => c.match(/\d+/g).map(Number));
  assert.ok(warm[2] < cool[2], 'warm lamps have less blue than cool ones');
  assert.equal(shade('#808080', 0.5), 'rgb(64,64,64)');
  assert.equal(shade('rgb(10,20,30)', 2), 'rgb(20,40,60)');
  const r = seeded(1); const values = Array.from({ length: 50 }, r);
  assert.ok(values.every(v => v >= 0 && v < 1) && new Set(values).size === 50);
});

/** A canvas stand-in that records filled rectangles. */
function recorder() {
  const rects = [];
  let fill = '';
  const gradient = () => ({ addColorStop() {} });
  return {
    rects,
    get fillStyle() { return fill; }, set fillStyle(v) { fill = typeof v === 'string' ? v : 'gradient'; },
    fillRect(x, y, w, h) { rects.push({ x, y, w, h, fill }); },
    createLinearGradient: gradient, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {},
  };
}

test('day, night and gloss maps put the windows in the same places', () => {
  for (const style of Object.keys(FACADE_STYLES)) {
    const lit = litWindows(3, 1);
    const glass = mode => { const c = recorder(); drawFacade(c, style, 256, mode, lit); return c.rects; };
    const day = glass('day'); const night = glass('night'); const gloss = glass('gloss');
    assert.equal(day[0].w, 256, `${style}: the wall fills the tile`);
    const [gx0, gy0, gx1, gy1] = FACADE_STYLES[style].glass;
    const cell = 256 / FACADE_TILE.bays;
    const isPane = r => Math.abs(r.w - (gx1 - gx0) * cell) < 1e-6 && Math.abs(r.h - (gy1 - gy0) * cell) < 1e-6;
    const panes = rects => rects.filter(isPane).map(r => `${r.x.toFixed(2)},${r.y.toFixed(2)}`);
    assert.equal(new Set(panes(day)).size, 16, `${style}: 16 windows a tile`);
    assert.deepEqual(new Set(panes(night)), new Set(panes(day)), `${style}: night windows line up with the day ones`);
    assert.deepEqual(new Set(panes(gloss)), new Set(panes(day)), `${style}: shiny glass lines up with the day ones`);
    for (const r of day.filter(isPane)) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 256 && r.y + r.h <= 256);
  }
  // With every lamp off, the night map is dark glass on black.
  const off = recorder(); drawFacade(off, 'brick', 256, 'night', litWindows(3, 0));
  assert.ok(off.rects.every(r => r.fill === '#000000' || r.fill === '#06080b'));
});

test('rooftop plant sits wholly on flat roofs, never on houses or over the edge', () => {
  let total = 0;
  for (const building of city.buildings) {
    const units = rooftopUnits(building);
    assert.deepEqual(units, rooftopUnits(building));
    if (facadeStyleFor(building) === 'house') assert.equal(units.length, 0);
    for (const u of units) {
      for (const [x, z] of [[u.x - u.width / 2, u.z - u.depth / 2], [u.x + u.width / 2, u.z + u.depth / 2], [u.x - u.width / 2, u.z + u.depth / 2], [u.x + u.width / 2, u.z - u.depth / 2]]) {
        assert.ok(pointInRing(x, z, building.ring), `building ${building.id}: unit corner inside the roof`);
      }
      assert.ok(u.height > 0.5 && u.height < 3);
    }
    for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
      const [a, b] = [units[i], units[j]];
      assert.ok(Math.abs(a.x - b.x) > (a.width + b.width) / 2 || Math.abs(a.z - b.z) > (a.depth + b.depth) / 2, 'units do not overlap');
    }
    total += units.length;
  }
  assert.ok(total > 60, `${total} rooftop units downtown`);
  assert.ok(city.buildings.some(b => rooftopUnits(b).some(u => u.kind === 'housing')), 'tall blocks have a stair housing');
});

test('awnings hang over shop walls that face a street, out towards it', () => {
  const shops = city.buildings.filter(b => b.shop || ['commercial', 'retail'].includes(b.kind));
  let total = 0;
  for (const building of city.buildings) {
    const spans = awningSpans(building, city.roads);
    if (!shops.includes(building) || !FACADE_STYLES[facadeStyleFor(building)].storefront) assert.equal(spans.length, 0);
    for (const s of spans) {
      assert.ok(Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) > 2, 'spans are at least a shopfront wide');
      assert.ok(Math.abs(Math.hypot(...s.normal) - 1) < 0.02, 'unit normal');
      // A step out along the normal leaves the building: the awning hangs outside, not indoors.
      const mx = (s.a[0] + s.b[0]) / 2 + s.normal[0] * 0.6; const mz = (s.a[1] + s.b[1]) / 2 + s.normal[1] * 0.6;
      assert.ok(!pointInRing(mx, mz, building.ring), `building ${building.id}: awning points outwards`);
      assert.match(s.colour, /^#[0-9a-f]{6}$/);
    }
    total += spans.length;
  }
  assert.ok(total >= 30, `${total} shop awnings downtown`);
  const shop = { id: 8, kind: 'retail', name: '', height: 8, shop: true, ring: [[0, 0], [10, 0], [10, 8], [0, 8]] };
  const road = { id: 1, kind: 'residential', width: 8, name: 'Test St', points: [[-20, -8], [30, -8]] };
  const spans = awningSpans(shop, [road]);
  assert.equal(spans.length, 1, 'only the wall facing the street');
  assert.deepEqual(spans[0].normal, [0, -1]);
  assert.equal(awningSpans(shop, [{ ...road, kind: 'footway' }]).length, 0, 'not over a footpath');
  assert.equal(awningSpans({ ...shop, shop: false, kind: 'yes' }, [road]).length, 0, 'not on buildings that are not shops');
});
