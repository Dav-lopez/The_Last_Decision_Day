import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutProblems, overlaps, MIN_TOUCH_TARGET } from '../src/world/phoneLayout.mjs';

const viewport = { width: 360, height: 640 };
const rect = (x, y, width, height) => ({ x, y, width, height });

test('a layout that fits a 360-pixel phone has no problems', () => {
  assert.deepEqual(layoutProblems({
    viewport, documentWidth: 360,
    elements: [
      { name: 'caption', kind: 'hud', rect: rect(8, 8, 200, 30) },
      { name: 'objective', kind: 'hud', rect: rect(190, 44, 162, 80) },
      { name: 'Map button', kind: 'target', rect: rect(8, 400, 90, 44) },
    ],
    overlays: ['caption', 'objective'],
  }), []);
});

test('sideways scrolling is reported', () => {
  const problems = layoutProblems({ viewport, documentWidth: 412, elements: [] });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /scrolls sideways: 412px/);
});

test('elements running off either edge are reported', () => {
  const problems = layoutProblems({ viewport, documentWidth: 360, elements: [
    { name: 'action button', kind: 'hud', rect: rect(-30, 200, 300, 40) },
    { name: 'drive HUD', kind: 'hud', rect: rect(100, 200, 300, 40) },
  ] });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /action button runs off/);
  assert.match(problems[1], /drive HUD runs off/);
});

test('touch targets below the minimum size are reported, HUD text is not', () => {
  const problems = layoutProblems({ viewport, documentWidth: 360, elements: [
    { name: 'Pass', kind: 'target', rect: rect(10, 10, 60, 26) },
    { name: 'energy label', kind: 'hud', rect: rect(10, 50, 60, 20) },
    { name: 'Jump', kind: 'target', rect: rect(10, 90, MIN_TOUCH_TARGET, MIN_TOUCH_TARGET) },
  ] });
  assert.deepEqual(problems, ['Pass is too small to tap (60×26px, needs 40)']);
});

test('hidden (zero-size) elements are ignored', () => {
  assert.deepEqual(layoutProblems({ viewport, documentWidth: 360, elements: [
    { name: 'hidden', kind: 'target', rect: rect(500, 0, 0, 0) },
  ] }), []);
});

test('only listed overlays are checked for covering each other', () => {
  const elements = [
    { name: 'energy', kind: 'hud', rect: rect(8, 44, 170, 50) },
    { name: 'objective', kind: 'hud', rect: rect(150, 44, 200, 60) },
    { name: 'controls text', kind: 'hud', rect: rect(8, 44, 340, 200) },
  ];
  assert.deepEqual(layoutProblems({ viewport, documentWidth: 360, elements, overlays: ['energy', 'objective'] }),
    ['energy covers objective']);
});

test('touching edges and sub-pixel rounding do not count as overlap', () => {
  assert.equal(overlaps(rect(0, 0, 100, 40), rect(100, 0, 100, 40)), false);
  assert.equal(overlaps(rect(0, 0, 100.6, 40), rect(100, 0, 100, 40)), false);
  assert.equal(overlaps(rect(0, 0, 110, 40), rect(100, 0, 100, 40)), true);
});
