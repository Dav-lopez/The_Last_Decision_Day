import test from 'node:test';
import assert from 'node:assert/strict';
import { LOOKS } from '../src/world/appearance.mjs';
import { skinSurface, hairSurface, skinRoughness } from '../src/world/surfaceShading.mjs';
const linear = hex => [1,3,5].map(i => { const v = parseInt(hex.slice(i,i+2),16)/255; return v <= 0.04045 ? v/12.92 : ((v+0.055)/1.055)**2.4; });
const bounded = xs => xs.every(v => Number.isFinite(v) && v >= 0 && v <= 1);
test('six skin swatches generate finite PBR colours', () => {
  for (const swatch of LOOKS.skin) {
    const s = skinSurface(linear(swatch.hex));
    assert.ok(bounded([...s.subsurfaceTint,...s.lip,...s.cheek,s.translucencyIntensity]), swatch.id);
  }
});
test('deep skin retains dark tint, lips and blush relative to pale skin', () => {
  const pale = skinSurface(linear(LOOKS.skin[0].hex)), deep = skinSurface(linear(LOOKS.skin.at(-1).hex));
  for (const part of ['subsurfaceTint','lip','cheek']) assert.ok(deep[part].every((v,i) => v < pale[part][i]), part);
  assert.ok(deep.subsurfaceTint[0] < 0.15);
});
test('sweat roughness is smooth and clamped on invalid frames', () => {
  assert.equal(skinRoughness(0),0.82);
  assert.ok(Math.abs(skinRoughness(1)-0.69)<1e-12);
  assert.ok(skinRoughness(0.5)<skinRoughness(0) && skinRoughness(0.5)>skinRoughness(1));
  assert.equal(skinRoughness(NaN),0.82);
  assert.equal(skinRoughness(-1),0.82);
});
test('hair sheen remains visible on black hair and tracks hair swatches', () => {
  for (const swatch of LOOKS.hair) { const h=hairSurface(linear(swatch.hex)); assert.ok(bounded([...h.sheenColor,h.sheenIntensity,h.sheenRoughness])); }
  assert.ok(hairSurface([0,0,0]).sheenColor.every(v=>v>0));
  assert.ok(hairSurface([0.8,0.6,0.3]).sheenColor[0]>hairSurface([0,0,0]).sheenColor[0]);
});
test('invalid and extreme colour inputs do not generate NaNs', () => {
  for (const input of [null,[],[NaN,Infinity,-100],[2,5,1.5]]) {
    const s=skinSurface(input),h=hairSurface(input);
    assert.ok(bounded([...s.subsurfaceTint,...s.lip,...s.cheek,s.translucencyIntensity]));
    assert.ok(bounded([...h.sheenColor,h.sheenIntensity,h.sheenRoughness]));
  }
});
