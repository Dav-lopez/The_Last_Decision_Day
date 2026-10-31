import test from 'node:test';
import assert from 'node:assert/strict';
import { npcSpeechWeight } from '../src/world/npcSpeechDynamics.mjs';
import { npcFaceTarget } from '../src/world/npcFace.mjs';

const names = ['jawOpen', 'mouthOpen', 'mouthPressLeft', 'mouthPressRight'];

test('NPC jaw and mouth articulate with changing syllables and consonant closure', () => {
  const jaw = [0.12, 0.23, 0.41, 0.63].map(t => npcSpeechWeight('jawOpen', t));
  assert.ok(jaw.every(v => v > 0));
  assert.ok(new Set(jaw.map(v => v.toFixed(4))).size >= 3);
  assert.ok(npcSpeechWeight('mouthOpen', 0.23) > 0);
  assert.ok(npcSpeechWeight('mouthPressLeft', 0.23) > npcSpeechWeight('mouthPressRight', 0.23) > 0);
});

test('natural phrase breaks close lips and restart without affecting non-speech morphs', () => {
  for (const t of [2.2, 2.3, 2.65]) for (const name of names) assert.equal(npcSpeechWeight(name, t), 0);
  assert.ok(npcSpeechWeight('jawOpen', 2.85) > 0);
  for (const name of ['eyeBlinkLeft', 'eyeLookDownRight', 'mouthSmileLeft', 'tearTrackLeft']) {
    assert.equal(npcSpeechWeight(name, 0.4), 0);
  }
});

test('NPC facial integration keeps emotion and flinch independent of speech pauses', () => {
  assert.equal(npcFaceTarget('mouthOpen', 2.3, { talking: true }), 0);
  assert.equal(npcFaceTarget('jawOpen', 2.3, { talking: true }), 0);
  assert.ok(npcFaceTarget('mouthPressLeft', 0.23, { talking: true }) > 0);
  assert.ok(npcFaceTarget('mouthOpen', 2.3, { talking: true, flinch: 1 }) > 0);
  assert.ok(npcFaceTarget('jawOpen', 2.3, { talking: true, emotion: 'sad' }) > 0);
  assert.equal(npcFaceTarget('mouthPressRight', 0.23, { talking: false }), 0);
  assert.equal(npcFaceTarget('eyeBlinkLeft', 0.23, { talking: true }), 0);
});

test('invalid times never corrupt morphs and all weights stay in range', () => {
  for (const t of [NaN, Infinity, -Infinity, -10]) for (const name of names) assert.equal(npcSpeechWeight(name, t), 0);
  for (let i = 0; i < 10000; i++) for (const name of names) {
    const value = npcSpeechWeight(name, i / 60);
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
  }
});
