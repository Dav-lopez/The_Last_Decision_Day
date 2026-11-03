import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PHOTO_FILTERS, PHOTO_LIMIT, ZOOM, addPhoto, aimCamera, applyPhotoFilter, captureSize, clampZoom, filterById, filterCss,
  filterPixel, fovForZoom, nextFilter, normalizeGallery, photoFileName, photoKeyAction, photoStamp, readGallery, removePhoto, writeGallery,
} from '../src/world/photoMode.mjs';

const memory = (limitBytes = Infinity) => {
  const items = new Map();
  return {
    items,
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => { if (value.length > limitBytes) throw new Error('QuotaExceededError'); items.set(key, value); },
    removeItem: key => items.delete(key),
  };
};
const photo = (id, size = 10) => ({ id, src: `data:image/jpeg;base64,${'A'.repeat(size)}`, stamp: `Day 1 · 9:00 AM · Maple Street`, name: `${id}.jpg`, filter: 'natural' });

test('filters cycle both ways and preview with the same operations they save with', () => {
  assert.equal(nextFilter('natural').id, 'golden');
  assert.equal(nextFilter('natural', -1).id, PHOTO_FILTERS.at(-1).id);
  assert.equal(nextFilter(PHOTO_FILTERS.at(-1).id).id, 'natural');
  assert.equal(nextFilter('nope').id, 'golden');
  assert.equal(filterById('missing').id, 'natural');
  assert.equal(filterCss('natural'), 'none');
  assert.equal(filterCss('mono'), 'grayscale(1) contrast(1.18)');
  assert.equal(new Set(PHOTO_FILTERS.map(f => f.id)).size, PHOTO_FILTERS.length);
});

test('pixel filters follow the CSS formulas', () => {
  assert.deepEqual(filterPixel([10, 200, 90], 'natural'), [10, 200, 90]);
  // Black & white: every channel equal; grey stays grey under contrast round mid-grey.
  const [r, g, b] = filterPixel([200, 40, 40], 'mono');
  assert.equal(r, g); assert.equal(g, b);
  assert.deepEqual(filterPixel([128, 128, 128], 'mono').map(v => Math.abs(v - 128) <= 1), [true, true, true]);
  // Vivid pushes a colour further from grey; nothing leaves 0–255.
  const vivid = filterPixel([200, 100, 60], 'vivid');
  assert.ok(vivid[0] - vivid[2] > 140);
  for (const filter of PHOTO_FILTERS) for (const rgb of [[0, 0, 0], [255, 255, 255], [255, 0, 0]]) {
    for (const v of filterPixel(rgb, filter.id)) assert.ok(v >= 0 && v <= 255, `${filter.id} ${rgb}`);
  }
  // Golden hour warms: red rises against blue.
  const warm = filterPixel([120, 120, 120], 'golden');
  assert.ok(warm[0] > warm[2]);
});

test('applyPhotoFilter filters RGBA in place, darkens the corners with a vignette and leaves alpha alone', () => {
  const width = 21, height = 11;
  const data = new Uint8ClampedArray(width * height * 4).fill(180);
  applyPhotoFilter(data, width, height, 'mono');
  const at = (x, y) => (y * width + x) * 4;
  assert.ok(data[at(0, 0)] < data[at(10, 5)], 'corner darker than centre');
  assert.equal(data[at(0, 0) + 3], 180, 'alpha untouched');
  const plain = new Uint8ClampedArray(16).fill(77);
  applyPhotoFilter(plain, 2, 2, 'natural');
  assert.deepEqual([...plain], new Array(16).fill(77));
});

test('zoom snaps to steps inside 1×–3× and narrows the field of view', () => {
  assert.equal(clampZoom(0), ZOOM.min);
  assert.equal(clampZoom(9), ZOOM.max);
  assert.equal(clampZoom(1.6), 1.5);
  assert.equal(clampZoom(NaN), 1);
  assert.ok(Math.abs(fovForZoom(0.8, 1) - 0.8) < 1e-9);
  assert.ok(fovForZoom(0.8, 2) < 0.45 && fovForZoom(0.8, 2) > 0.4);
});

test('keys aim the camera instead of walking, shoot, change filters and leave', () => {
  assert.equal(photoKeyAction(' '), 'shoot');
  assert.equal(photoKeyAction('Enter'), 'shoot');
  assert.equal(photoKeyAction('F'), 'filter');
  assert.equal(photoKeyAction('f', true), 'filter-back');
  assert.equal(photoKeyAction('W'), 'tilt-up');
  assert.equal(photoKeyAction('ArrowLeft'), 'turn-left');
  assert.equal(photoKeyAction('+'), 'zoom-in');
  assert.equal(photoKeyAction('-'), 'zoom-out');
  for (const key of ['Escape', 'p', 'P', 'c']) assert.equal(photoKeyAction(key), 'exit', key);
  assert.equal(photoKeyAction('e'), null);
  const view = { alpha: 1, beta: 1 };
  assert.ok(aimCamera(view, 'turn-left').alpha > 1);
  assert.ok(aimCamera(view, 'turn-right').alpha < 1);
  assert.equal(aimCamera({ alpha: 0, beta: 1.49 }, 'tilt-up').beta, 1.5);
  assert.equal(aimCamera({ alpha: 0, beta: 0.26 }, 'tilt-down').beta, 0.25);
});

test('captures fit inside the size budget keeping their shape', () => {
  assert.deepEqual(captureSize(1920, 1080), { width: 960, height: 540 });
  assert.deepEqual(captureSize(360, 640), { width: 360, height: 640 });
  assert.deepEqual(captureSize(0, NaN), { width: 1, height: 1 });
});

test('stamps and file names read well and stay safe', () => {
  assert.equal(photoStamp({ day: 3, clock: '6:20 PM', place: 'street' }), 'Day 3 · 6:20 PM · Maple Street');
  assert.equal(photoStamp({ day: 2, clock: '9:05 AM', place: 'city' }), 'Day 2 · 9:05 AM · Downtown Boulder');
  assert.equal(photoStamp({ day: 0, clock: '', place: '' }), 'Day 1 · — · Maple Street');
  assert.equal(photoFileName({ day: 3, clock: '6:20 PM', index: 2 }), 'last-decision-day-day3-620pm-2.jpg');
  assert.match(photoFileName({ day: 1, clock: '../<x>' }), /^last-decision-day-day1-[a-z0-9]+-1\.jpg$/);
});

test('the gallery keeps the newest photos, drops bad entries and survives full storage', () => {
  let gallery = [];
  for (let i = 0; i < PHOTO_LIMIT + 3; i++) gallery = addPhoto(gallery, photo(`p${i}`));
  assert.equal(gallery.length, PHOTO_LIMIT);
  assert.equal(gallery[0].id, `p${PHOTO_LIMIT + 2}`);
  assert.equal(removePhoto(gallery, gallery[0].id).length, PHOTO_LIMIT - 1);
  assert.deepEqual(normalizeGallery([photo('a'), photo('a'), { id: 'x', src: 'javascript:alert(1)', stamp: '' }, null, 5]).map(p => p.id), ['a']);
  assert.deepEqual(normalizeGallery('nope'), []);

  const storage = memory();
  writeGallery('kid', gallery, storage);
  assert.deepEqual(readGallery('kid', storage).map(p => p.id), gallery.map(p => p.id));
  assert.deepEqual(readGallery('someone-else', storage), []);
  writeGallery('kid', [], storage);
  assert.equal(storage.items.size, 0);

  // Storage that only fits about three photos: the oldest are dropped until it fits.
  const small = memory(JSON.stringify([photo('a', 100), photo('b', 100), photo('c', 100)]).length + 5);
  const big = ['a', 'b', 'c', 'd', 'e'].map(id => photo(id, 100));
  const kept = writeGallery('kid', big, small);
  assert.deepEqual(kept.map(p => p.id), ['a', 'b', 'c']);
  assert.equal(readGallery('kid', small).length, 3);
  const broken = { getItem: () => '{not json', setItem: () => { throw new Error('denied'); } };
  assert.deepEqual(readGallery('kid', broken), []);
  assert.equal(writeGallery('kid', [photo('z')], broken).length, 1);
});

test('the viewfinder and capture code stay out of the first download', async () => {
  const { readFile } = await import('node:fs/promises');
  const scene = await readFile(new URL('../src/world/WorldScene.tsx', import.meta.url), 'utf8');
  const eager = [...scene.matchAll(/^import (?!type )[^;]*? from '([^']+)';/gm)].map(match => match[1]);
  for (const lazyOnly of ['./PhotoMode', './photoMode.mjs']) assert.ok(!eager.includes(lazyOnly), `${lazyOnly} is imported eagerly`);
  assert.match(scene, /import\('\.\/PhotoMode'\)/);
});
