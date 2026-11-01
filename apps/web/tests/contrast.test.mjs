import test from 'node:test';
import assert from 'node:assert/strict';
import { auditSample, composite, contrastRatio, isLargeText, parseColor, requiredContrast, worstContrast } from '../src/world/contrast.mjs';

test('parses the colour forms computed styles and our CSS use', () => {
  assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseColor('#11243acb'), { r: 17, g: 36, b: 58, a: 203 / 255 });
  assert.deepEqual(parseColor('rgb(10, 20, 30)'), { r: 10, g: 20, b: 30, a: 1 });
  assert.deepEqual(parseColor('rgba(0, 0, 0, 0.5)'), { r: 0, g: 0, b: 0, a: 0.5 });
  assert.deepEqual(parseColor('rgb(0 0 0 / 25%)'), { r: 0, g: 0, b: 0, a: 0.25 });
  assert.deepEqual(parseColor('transparent'), { r: 0, g: 0, b: 0, a: 0 });
  for (const bad of ['', 'red', '#12', 'rgb(1,2)', null, 3]) assert.equal(parseColor(bad), null, String(bad));
});

test('contrast ratios match the WCAG reference values', () => {
  const black = parseColor('#000'), white = parseColor('#fff');
  assert.equal(Math.round(contrastRatio(black, white) * 100) / 100, 21);
  assert.equal(contrastRatio(white, white), 1);
  // #767676 on white is the classic 4.54:1 grey.
  assert.ok(Math.abs(contrastRatio(parseColor('#767676'), white) - 4.54) < 0.01);
});

test('a translucent panel is judged over both a dark and a bright scene', () => {
  // Half-black panel: fine for white text over night, poor over a white sky.
  const half = worstContrast('#fff', ['rgba(0,0,0,0.5)']);
  assert.ok(half.ratio < 4.5 && half.backdrop.r === 255);
  // The caption strip (#000000d9) keeps white text readable anywhere.
  assert.ok(worstContrast('#fff', ['#000000d9']).ratio >= 4.5);
  // Nested layers composite outermost-first.
  const nested = worstContrast('#fff', ['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.5)']);
  assert.ok(nested.ratio > half.ratio);
  assert.deepEqual(composite(parseColor('rgba(0,0,0,0)'), parseColor('#123456')), parseColor('#123456'));
});

test('large text needs 3:1, everything else 4.5:1', () => {
  assert.equal(isLargeText(24), true);
  assert.equal(isLargeText(19, 700), true);
  assert.equal(isLargeText(19, 400), false);
  assert.equal(requiredContrast(14), 4.5);
  assert.equal(requiredContrast(30), 3);
});

test('audit samples report only failures, with the numbers', () => {
  assert.equal(auditSample({ label: 'caption', color: '#fff', layers: ['#000000d9'], fontSize: 14 }), null);
  const finding = auditSample({ label: 'hint', color: 'rgba(255,255,255,0.6)', layers: ['rgba(17,36,58,0.5)'], fontSize: 12 });
  assert.equal(finding.label, 'hint');
  assert.equal(finding.needed, 4.5);
  assert.equal(finding.over, 'bright scene');
  assert.ok(finding.ratio < 4.5);
  // Text on the page (outside the 3D view) is judged on the page colour only.
  assert.equal(auditSample({ label: 'help', color: '#333', layers: [], overScene: false }), null);
  assert.equal(auditSample({ label: 'help', color: '#bbb', layers: [], overScene: false }).over, 'page');
});
