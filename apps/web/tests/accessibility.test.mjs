import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTION_MODES, TEXT_SIZES, normalizeSettings, readSettings, reducedMotion, textScale, writeSettings } from '../src/world/gameSettings.mjs';
import { CAPTION_SECONDS, MAX_CAPTIONS, SOUND_CAPTIONS, activeCaptions, captionFor, captionLabel, pushCaption } from '../src/world/soundCaptions.mjs';
import { CUES } from '../src/world/audio/score.mjs';
import { createGameAudio } from '../src/world/audio/director.mjs';

const memory = () => {
  const store = new Map();
  return { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) };
};

test('accessibility settings default to device motion, no captions and normal text, and save', () => {
  assert.deepEqual(MOTION_MODES.map(mode => mode.id), ['system', 'reduce', 'full']);
  assert.deepEqual(TEXT_SIZES.map(size => size.id), ['normal', 'large']);
  const storage = memory();
  assert.deepEqual(readSettings(storage), { graphics: 'auto', hintDismissed: false, motion: 'system', captions: false, textSize: 'normal' });
  writeSettings({ graphics: 'quality', motion: 'reduce', captions: true, textSize: 'large' }, storage);
  assert.deepEqual(readSettings(storage), { graphics: 'quality', hintDismissed: false, motion: 'reduce', captions: true, textSize: 'large' });
  assert.deepEqual(normalizeSettings({ motion: 'wobbly', captions: 'yes', textSize: 'huge' }),
    { graphics: 'auto', hintDismissed: false, motion: 'system', captions: false, textSize: 'normal' });
});

test('reduced motion follows the device unless the player chooses', () => {
  assert.equal(reducedMotion({ motion: 'system' }, true), true);
  assert.equal(reducedMotion({ motion: 'system' }, false), false);
  assert.equal(reducedMotion({ motion: 'reduce' }, false), true);
  assert.equal(reducedMotion({ motion: 'full' }, true), false);
  assert.equal(reducedMotion(null, true), true);
  assert.equal(textScale({ textSize: 'large' }) > 1.1, true);
  assert.equal(textScale({}), 1);
});

test('every caption describes a real sound cue; frequent visual sounds stay quiet', () => {
  for (const cue of Object.keys(SOUND_CAPTIONS)) assert.ok(Object.hasOwn(CUES, cue), cue);
  for (const cue of ['bell', 'message', 'door', 'whistle', 'goal', 'horn', 'wake']) assert.ok(captionFor(cue), cue);
  for (const cue of ['jump', 'land', 'kick', 'nope', '__proto__']) assert.equal(captionFor(cue), null, cue);
});

test('captions stack newest last, merge repeats, cap at three and expire', () => {
  let list = pushCaption([], 'bell', 0);
  list = pushCaption(list, 'door', 0.5);
  list = pushCaption(list, 'bell', 1);
  assert.deepEqual(list.map(captionLabel), ['[Door opens]', '[School bell rings] ×2']);
  list = pushCaption(list, 'horn', 1.2);
  list = pushCaption(list, 'message', 1.4);
  assert.equal(list.length, MAX_CAPTIONS);
  assert.deepEqual(list.map(c => c.text), ['School bell rings', 'Car horn', 'Phone buzzes: new message']);
  assert.equal(new Set(list.map(c => c.id)).size, list.length, 'ids stay unique for React keys');
  assert.equal(pushCaption(list, 'jump', 1.5).length, 3, 'uncaptioned cues add nothing');
  assert.deepEqual(activeCaptions(list, 1 + CAPTION_SECONDS).map(c => c.text), ['Car horn', 'Phone buzzes: new message']);
  assert.deepEqual(activeCaptions(list, 10), []);
  assert.deepEqual(activeCaptions(null, 0), []);
});

test('the audio director reports cues for captions even before audio is enabled or while muted', () => {
  const heard = [];
  const audio = createGameAudio({ onCue: cue => heard.push(cue) });
  audio.cue('bell');
  audio.setSettings({ master: .5, music: .5, effects: .5, ambience: .5, muted: true });
  audio.cue('door');
  audio.cue('not-a-cue');
  assert.deepEqual(heard, ['bell', 'door']);
  const broken = createGameAudio({ onCue: () => { throw new Error('ui gone'); } });
  assert.doesNotThrow(() => broken.cue('bell'));
});
