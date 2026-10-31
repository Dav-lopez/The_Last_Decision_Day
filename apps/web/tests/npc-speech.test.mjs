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
  assert.ok(npcSpeechWeight('mouthPressRight', 0.23) > 0);
  assert.ok(npcSpeechWeight('mouthPressLeft', 0.23) > npcSpeechWeight('mouthPressRight', 0.23));
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

import { npcSpeechDuration, beginNpcSpeech, advanceNpcSpeech, isNpcSpeaking, npcShouldArticulate } from '../src/world/npcSpeechTimeline.mjs';

test('dialogue text creates finite, bounded speech windows instead of endless mouth loops', () => {
  assert.equal(npcSpeechDuration(''), 0);
  assert.equal(npcSpeechDuration(null), 0);
  assert.ok(npcSpeechDuration('Hello, how are you?') > npcSpeechDuration('Hello'));
  assert.ok(npcSpeechDuration('a '.repeat(5000)) <= 8);
  assert.ok(npcSpeechDuration('Hi') >= 0.8);
});

test('NPC finishes a line but keeps its selected identity and emotional reaction', () => {
  let speech = beginNpcSpeech('maya', 'sad', 'I am upset about what happened.');
  assert.equal(isNpcSpeaking(speech), true);
  for (let i = 0; i < 1000; i++) speech = advanceNpcSpeech(speech, 1 / 60);
  assert.equal(isNpcSpeaking(speech), false);
  assert.equal(speech.elapsed, speech.duration);
  assert.equal(speech.id, 'maya');
  assert.equal(speech.mood, 'sad');
  assert.equal(npcFaceTarget('mouthOpen', 0.5, { talking: false, emotion: speech.mood }), 0);
  assert.ok(npcFaceTarget('mouthFrownLeft', 0.5, { talking: false, emotion: speech.mood }) > 0);
});

test('a new reply restarts articulation for the same NPC without resetting other faces', () => {
  let speech = beginNpcSpeech('maya', 'neutral', 'Hello!');
  for (let i = 0; i < 1000; i++) speech = advanceNpcSpeech(speech, 1 / 60);
  assert.equal(isNpcSpeaking(speech), false);
  speech = beginNpcSpeech('maya', 'happy', 'Thank you for coming back!');
  assert.equal(speech.elapsed, 0);
  assert.equal(speech.mood, 'happy');
  assert.equal(isNpcSpeaking(speech), true);
  assert.equal(isNpcSpeaking(beginNpcSpeech(null, 'happy', 'Hello')), false);
});

test('speech clock is independent of NPC idle face clock and never changes gaze or blink', () => {
  const oldPhase = npcFaceTarget('jawOpen', 2.3, { talking: true });
  const newLine = npcFaceTarget('jawOpen', 2.3, { talking: true, speechElapsed: 0.23 });
  assert.equal(oldPhase, 0, 'old idle face phase is in a phrase pause');
  assert.ok(newLine > 0, 'new reply uses its own speech clock');
  assert.equal(npcFaceTarget('eyeBlinkLeft', 2.3, { talking: true, speechElapsed: 0.23 }), 0);
  assert.equal(npcFaceTarget('eyeLookDownLeft', 2.3, { talking: true, emotion: 'sad', speechElapsed: 0.23 }),
    npcFaceTarget('eyeLookDownLeft', 2.3, { talking: true, emotion: 'sad' }));
});

test('invalid or huge frames cannot skip a line or propagate non-finite speech state', () => {
  let speech = beginNpcSpeech('jordan', 'neutral', 'Hello world');
  for (const dt of [NaN, Infinity, -Infinity, -1]) {
    speech = advanceNpcSpeech(speech, dt);
    assert.equal(speech.elapsed, 0);
  }
  speech = advanceNpcSpeech(speech, 999);
  assert.equal(speech.elapsed, 0.1);
  assert.equal(isNpcSpeaking(speech), true);
  assert.equal(npcFaceTarget('jawOpen', NaN, { talking: true, speechElapsed: NaN }), 0.06);
});

test('selected standing NPC does not fall back to ambient mouth loops after a reply', () => {
  let speech = beginNpcSpeech('maya', 'neutral', 'Hello!');
  assert.equal(npcShouldArticulate(speech, 'maya', true), true);
  for (let i = 0; i < 1000; i++) speech = advanceNpcSpeech(speech, 1 / 60);
  assert.equal(npcShouldArticulate(speech, 'maya', true), false);
  assert.equal(npcShouldArticulate(speech, 'jordan', true), true);
  assert.equal(npcShouldArticulate(speech, 'jordan', false), false);
});
