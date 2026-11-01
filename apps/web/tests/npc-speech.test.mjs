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
  assert.equal(advanceNpcSpeech(speech, 1 / 60), speech, 'finished lines do not allocate new states');
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


import { buildNpcSpeechCues, npcSpeechCueWeight } from '../src/world/npcSpeechCues.mjs';

const middle = cue => (cue.start + cue.end) / 2;

test('displayed dialogue produces text-specific vowel, labial and punctuation cues', () => {
  const cues = buildNpcSpeechCues('Papa, no!', 1.8);
  assert.ok(cues.length >= 7);
  const closure = cues.find(cue => cue.press > 0);
  const vowel = cues.find(cue => cue.open > 0);
  const pause = cues.find(cue => cue.open === 0 && cue.press === 0 && cue.end - cue.start > 0.15);
  assert.ok(closure && vowel && pause, 'labial, vowel and punctuation rest are all present');
  assert.ok(npcSpeechCueWeight('mouthPressLeft', middle(closure), cues) > 0.1);
  assert.equal(npcSpeechCueWeight('jawOpen', middle(closure), cues), 0);
  assert.ok(npcSpeechCueWeight('jawOpen', middle(vowel), cues) > 0.2);
  assert.ok(npcSpeechCueWeight('mouthOpen', middle(vowel), cues) > 0.15);
  assert.equal(npcSpeechCueWeight('mouthOpen', middle(pause), cues), 0);
  assert.equal(npcSpeechCueWeight('jawOpen', 1.8, cues), 0);
  assert.deepEqual(cues, buildNpcSpeechCues('Papa, no!', 1.8));
  assert.notDeepEqual(cues, buildNpcSpeechCues('Hello, no!', 1.8));
});

test('text cues are cached once per reply and do not replace ambient Talk animation', () => {
  const state = beginNpcSpeech('maya', 'sad', 'Papa, no!');
  assert.ok(state.cues.length > 0);
  assert.equal(state.cues.at(-1).end, state.duration);
  const next = advanceNpcSpeech(state, 0.08);
  assert.equal(next.cues, state.cues, 'no phonetic parsing or allocations per morph/frame');
  const vowel = state.cues.find(cue => cue.open > 0);
  const t = middle(vowel);
  assert.ok(npcSpeechWeight('jawOpen', t, state.cues) > 0);
  assert.equal(npcSpeechWeight('jawOpen', t, []), 0);
  assert.ok(npcSpeechWeight('jawOpen', 0.23) > 0, 'ambient Talk retains existing rhythm');
  assert.ok(npcFaceTarget('mouthOpen', t, { talking: true, speechElapsed: t, speechCues: state.cues }) > 0);
  assert.ok(npcFaceTarget('mouthFrownLeft', t, { emotion: 'sad', talking: true, speechCues: state.cues }) > 0);
  const restarted = beginNpcSpeech('maya', 'happy', 'Hello!');
  assert.notDeepEqual(restarted.cues, state.cues);
  assert.equal(restarted.elapsed, 0);
  assert.deepEqual(beginNpcSpeech(null, 'neutral', 'Hello').cues, []);
});

test('text cue builder bounds long/unicode lines and rejects malformed inputs', () => {
  for (const invalid of [null, undefined, 23, '', '!!!']) {
    assert.deepEqual(buildNpcSpeechCues(invalid, 1), []);
  }
  for (const duration of [NaN, Infinity, -1, 0]) {
    assert.deepEqual(buildNpcSpeechCues('hello', duration), []);
  }
  const long = buildNpcSpeechCues('Papa, '.repeat(1000), 8);
  assert.ok(long.length > 0 && long.length <= 96);
  assert.equal(long.at(-1).end, 8);
  assert.ok(long.every((cue, i) => cue.start >= 0 && cue.end > cue.start &&
    (i === 0 || cue.start >= long[i - 1].end) &&
    Number.isFinite(cue.open) && Number.isFinite(cue.press)));
  const unicode = buildNpcSpeechCues('你好, hola!', 2);
  assert.ok(unicode.some(cue => cue.open > 0));
  for (const name of ['jawOpen', 'mouthOpen', 'mouthPressLeft', 'mouthPressRight']) {
    for (let i = 0; i < 500; i++) {
      const value = npcSpeechCueWeight(name, i / 60, long);
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
    }
    for (const invalid of [NaN, Infinity, -1]) assert.equal(npcSpeechCueWeight(name, invalid, long), 0);
  }
  assert.equal(npcSpeechCueWeight('eyeBlinkLeft', 0.2, long), 0);
});


import { classifyNpcSpeechProsody, npcSpeechProsodyWeight } from '../src/world/npcSpeechProsody.mjs';

test('question and exclamation punctuation create distinct cached facial inflections', () => {
  for (const [line, kind] of [
    ['Are you coming?', 'question'], ['Really?!', 'question'],
    ['Welcome!', 'exclaim'], ['Hello.', 'none'], ['No punctuation', 'none'],
    ['What now?”', 'question'], ['!!', 'none'], [null, 'none'],
  ]) assert.equal(classifyNpcSpeechProsody(line), kind);
  const question = beginNpcSpeech('maya', 'neutral', 'Are you coming?');
  const exclaim = beginNpcSpeech('maya', 'neutral', 'Welcome!');
  assert.equal(question.prosody, 'question');
  assert.equal(exclaim.prosody, 'exclaim');
  assert.equal(beginNpcSpeech(null, 'neutral', 'Hello?').prosody, 'none');
  assert.equal(advanceNpcSpeech(question, 0.1).prosody, question.prosody,
    'classification is cached and never recomputed during animation');
});

test('speech prosody is finite, bounded and limited to existing facial morphs', () => {
  for (const kind of ['question', 'exclaim']) {
    for (const name of ['browInnerUp', 'eyeWideLeft', 'eyeWideRight']) {
      assert.equal(npcSpeechProsodyWeight(name, 0, 2, kind), 0);
      assert.ok(npcSpeechProsodyWeight(name, 1.5, 2, kind) > 0);
      assert.equal(npcSpeechProsodyWeight(name, 2, 2, kind), 0);
      for (const invalid of [NaN, Infinity, -Infinity, -1, 1000]) {
        assert.equal(npcSpeechProsodyWeight(name, invalid, 2, kind), 0);
      }
    }
  }
  assert.ok(npcSpeechProsodyWeight('browInnerUp', 1.5, 2, 'question') >
    npcSpeechProsodyWeight('browInnerUp', 1.5, 2, 'exclaim'));
  assert.ok(npcSpeechProsodyWeight('eyeWideRight', 1.5, 2, 'exclaim') >
    npcSpeechProsodyWeight('eyeWideRight', 1.5, 2, 'question'));
  for (const name of ['jawOpen', 'mouthSmileLeft', 'eyeBlinkLeft', 'tearTrackLeft']) {
    assert.equal(npcSpeechProsodyWeight(name, 1.5, 2, 'question'), 0);
  }
  for (const duration of [0, -1, NaN, Infinity]) {
    assert.equal(npcSpeechProsodyWeight('browInnerUp', 1, duration, 'question'), 0);
  }
});

test('NPC facial inflection follows the current line, yields to distress and fades after speech', () => {
  const base = { talking: true, emotion: 'neutral', speechElapsed: 1.5, speechDuration: 2 };
  const question = npcFaceTarget('browInnerUp', 0, { ...base, prosody: 'question' });
  const exclaim = npcFaceTarget('eyeWideRight', 0, { ...base, prosody: 'exclaim' });
  assert.ok(question > npcFaceTarget('browInnerUp', 0, { ...base, prosody: 'none' }));
  assert.ok(exclaim > npcFaceTarget('eyeWideRight', 0, { ...base, prosody: 'question' }));
  assert.equal(npcFaceTarget('eyeWideRight', 0, { ...base, prosody: 'exclaim', talking: false }), 0);
  assert.equal(npcFaceTarget('eyeWideRight', 0, { ...base, prosody: 'exclaim', moving: true }), 0);
  assert.equal(npcFaceTarget('eyeWideRight', 0, { ...base, prosody: 'exclaim', emotion: 'sad' }), 0);
  assert.equal(npcFaceTarget('eyeWideRight', 0, { ...base, prosody: 'exclaim', speechElapsed: 2 }), 0);
  assert.ok(npcFaceTarget('eyeWideRight', 0, { ...base, prosody: 'exclaim', flinch: 1 }) > 0,
    'startle retains its own eye-wide animation');
  const eye = { name: 'eyeWideLeft', influence: 0 };
  const copy = { name: 'eyeWideLeft', influence: 0 };
  let state = { elapsed: 0, motions: new Map(), frame: new Map() };
  for (let i = 0; i < 25; i++) state = advanceNpcFace(state, 1 / 60, [eye, copy],
    { ...base, prosody: 'exclaim', blink: { left: 1, right: 0 } });
  assert.equal(eye.influence, 0, 'blink masks the inflection on the closed eyelid');
  assert.equal(eye.influence, copy.influence, 'duplicate skinned surfaces stay synchronized');
  state = advanceNpcFace(state, 1 / 60, [eye, copy],
    { ...base, prosody: 'exclaim', blink: { left: 0, right: 0 } });
  assert.ok(eye.influence > 0, 'eyelid reopening restores the spring pose');
});
