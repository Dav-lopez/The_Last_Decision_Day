import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, PBRMaterial } from '@babylonjs/core';
import { DEFAULT_LOOK } from '../src/world/appearance.mjs';
import { createNpcFacialMaterials } from '../src/world/npcFacialMaterials.mjs';

function fixture(look = DEFAULT_LOOK, index = 0) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const names = ['skin', 'eyes', 'hair', 'lips', 'cheek blush', 'tear Left', 'tear Right', 'sweat Left', 'sweat Right'];
  const materials = names.map(name => new PBRMaterial(`npc ${index} Student ${name}`, scene));
  const by = name => materials.find(material => material.name.endsWith(`Student ${name}`));
  const tracks = ['tearTrackLeft', 'tearTrackRight', 'sweatTrackLeft', 'sweatTrackRight'].map(name => ({ name, influence: 0 }));
  const meshes = [{ morphTargetManager: { numTargets: tracks.length, getTarget: i => tracks[i] } }];
  const controller = createNpcFacialMaterials(materials, meshes, look, index);
  return { engine, scene, materials, by, tracks, controller, close() { scene.dispose(); engine.dispose(); } };
}

test('NPC skin, hair, lips and cheeks use complexion-aware PBR materials', t => {
  const light = fixture({ ...DEFAULT_LOOK, skin: 'porcelain', hair: 'blonde' }, 1);
  const dark = fixture({ ...DEFAULT_LOOK, skin: 'deep', hair: 'black' }, 2);
  t.after(() => { light.close(); dark.close(); });
  assert.equal(light.by('skin').subSurface.isTranslucencyEnabled, true);
  assert.ok(light.by('skin').subSurface.translucencyIntensity > 0);
  assert.ok(light.by('lips').albedoColor.r > dark.by('lips').albedoColor.r);
  assert.ok(light.by('cheek blush').albedoColor.r > dark.by('cheek blush').albedoColor.r);
  assert.equal(light.by('hair').sheen.isEnabled, true);
  assert.notEqual(light.by('hair').sheen.color.r, dark.by('hair').sheen.color.r);
  assert.equal(light.by('eyes').clearCoat.isEnabled, true);
});

test('sad dialogue wets eyes before tear tracks; reset clears all visible effects', t => {
  const f = fixture(DEFAULT_LOOK, 0);
  t.after(() => f.close());
  const result = f.controller.update(0.1, 'sad', false, 0);
  assert.ok(result.wateryEyes > result.tears, 'watery eyes rise before tear droplets');
  assert.ok(f.by('eyes').clearCoat.intensity > 0.55);
  assert.ok(f.by('tear Left').alpha > 0);
  assert.ok(f.tracks.find(track => track.name === 'tearTrackLeft').influence > 0);
  f.controller.reset();
  assert.equal(f.by('tear Left').alpha, 0);
  assert.equal(f.by('cheek blush').alpha, 0);
  assert.equal(f.by('eyes').clearCoat.intensity, 0.55);
  assert.ok(f.tracks.every(track => track.influence === 0));
});

test('happy dialogue blushes; flinching and movement produce independent sweat', t => {
  const f = fixture();
  t.after(() => f.close());
  assert.ok(f.controller.update(0.1, 'happy').blush > 0);
  assert.ok(f.by('cheek blush').alpha > 0);
  f.controller.reset();
  const fear = f.controller.update(0.1, 'neutral', false, 1);
  assert.ok(fear.sweat > 0);
  f.controller.reset();
  const movement = f.controller.update(0.1, 'neutral', true, 0);
  assert.ok(movement.sweat > 0);
});

test('NPC controllers do not share material state and reject invalid frame durations', t => {
  const first = fixture(DEFAULT_LOOK, 0), second = fixture(DEFAULT_LOOK, 1);
  t.after(() => { first.close(); second.close(); });
  first.controller.update(0.1, 'sad');
  assert.equal(second.by('tear Left').alpha, 0);
  assert.equal(second.by('eyes').clearCoat.intensity, 0.55);
  const before = first.controller.update(NaN, 'sad');
  assert.ok(Object.values(before).every(Number.isFinite));
  const after = first.controller.update(Infinity, 'neutral', false, Infinity);
  assert.ok(Object.values(after).every(v => v >= 0 && v <= 1));
});
