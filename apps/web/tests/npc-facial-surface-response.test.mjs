import test from 'node:test';
import assert from 'node:assert/strict';
import { collectNpcSurfaceMorphs, npcFacialSurfaceResponse } from '../src/world/npcFacialSurfaceResponse.mjs';

test('neutral surfaces preserve the existing eye and lip PBR defaults', () => {
  assert.deepEqual(npcFacialSurfaceResponse(), {
    eyeIntensity: 0.55, eyeRoughness: 0.12, lipRoughness: 0.65,
  });
});

test('wet eyes become glossier, then reduce highlights during bilateral blinks', () => {
  const wet = npcFacialSurfaceResponse(1);
  assert.ok(wet.eyeIntensity > 0.55 && wet.eyeRoughness < 0.12);
  const closed = npcFacialSurfaceResponse(1, { blinkLeft: 1, blinkRight: 1 });
  assert.ok(closed.eyeIntensity < wet.eyeIntensity);
  assert.ok(closed.eyeRoughness > wet.eyeRoughness);
  assert.equal(npcFacialSurfaceResponse(1, { blinkLeft: 1, blinkRight: 0 }).eyeIntensity, wet.eyeIntensity,
    'a wink must not dim the other eye when the two share one PBR material');
});

test('lip shading responds to mouth articulation without changing resting lips', () => {
  assert.ok(npcFacialSurfaceResponse(0, { jawOpen: 0.8 }).lipRoughness < 0.65);
  assert.equal(npcFacialSurfaceResponse(0, { jawOpen: 0, mouthOpen: 0 }).lipRoughness, 0.65);
  assert.equal(npcFacialSurfaceResponse(0, { jawOpen: 0.2, mouthOpen: 1 }).lipRoughness, 0.55);
});

test('duplicate morph names across skinned meshes resolve once at their maximum valid influence', () => {
  const meshes = [
    { morphTargetManager: { numTargets: 2, getTarget: i => [
      { name: 'eyeBlinkLeft', influence: 0.3 },
      { name: 'jawOpen', influence: 0.4 },
    ][i] } },
    { morphTargetManager: { numTargets: 4, getTarget: i => [
      { name: 'eyeBlinkLeft', influence: 0.9 },
      { name: 'eyeBlinkRight', influence: 0.8 },
      { name: 'jawOpen', influence: 0.7 },
      { name: 'mouthOpen', influence: 0.5 },
    ][i] } },
  ];
  const read = collectNpcSurfaceMorphs(meshes);
  assert.deepEqual(read(), { blinkLeft: 0.9, blinkRight: 0.8, jawOpen: 0.7, mouthOpen: 0.5 });
  assert.ok(npcFacialSurfaceResponse(0, read()).eyeIntensity < 0.55);
});

test('legacy missing morphs and malformed influences produce bounded finite PBR values', () => {
  assert.deepEqual(collectNpcSurfaceMorphs([null, {}, { morphTargetManager: { numTargets: 0 } }])(),
    { blinkLeft: 0, blinkRight: 0, jawOpen: 0, mouthOpen: 0 });
  const extreme = npcFacialSurfaceResponse(Infinity, {
    blinkLeft: NaN, blinkRight: 100, jawOpen: -1, mouthOpen: Infinity,
  });
  assert.deepEqual(extreme, npcFacialSurfaceResponse());
  for (const response of [
    npcFacialSurfaceResponse(-5, { blinkLeft: 20, blinkRight: 20, jawOpen: 20 }),
    npcFacialSurfaceResponse(20, { blinkLeft: 20, blinkRight: 20, mouthOpen: 20 }),
  ]) {
    assert.ok(Object.values(response).every(Number.isFinite));
    assert.ok(response.eyeIntensity >= 0.19 && response.eyeIntensity <= 0.9);
    assert.ok(response.eyeRoughness >= 0.08 && response.eyeRoughness <= 0.19);
    assert.ok(response.lipRoughness >= 0.55 && response.lipRoughness <= 0.65);
  }
});
