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

// MVP 7b: keyboard flow through the overlays (map, conversations, range, league table, wardrobe).
import { gpsDestinations, initialFocus, tabListTarget, trapTarget } from '../src/world/focusNav.mjs';

test('tab lists move with the arrows, wrap around, jump with Home/End and skip disabled tabs', () => {
  const all = [true, true, true, true];
  assert.equal(tabListTarget('ArrowRight', 0, all), 1);
  assert.equal(tabListTarget('ArrowRight', 3, all), 0);
  assert.equal(tabListTarget('ArrowLeft', 0, all), 3);
  assert.equal(tabListTarget('Home', 2, all), 0);
  assert.equal(tabListTarget('End', 0, all), 3);
  assert.equal(tabListTarget('ArrowDown', 0, all), null, 'down is not a horizontal tab key');
  assert.equal(tabListTarget('Enter', 0, all), null);
  // The map's downtown tab is disabled until downtown has been visited.
  assert.equal(tabListTarget('ArrowRight', 0, [true, false]), 0);
  assert.equal(tabListTarget('End', 0, [true, false]), 0);
  assert.equal(tabListTarget('ArrowRight', 0, [true, false, true]), 2);
  assert.equal(tabListTarget('ArrowLeft', 2, [true, false, true]), 0);
  assert.equal(tabListTarget('ArrowRight', 0, []), null);
  assert.equal(tabListTarget('ArrowRight', 0, [false, false]), null);
});

test('vertical lists (conversation answers) use up and down', () => {
  assert.equal(tabListTarget('ArrowDown', 0, [true, true, true], 'vertical'), 1);
  assert.equal(tabListTarget('ArrowUp', 0, [true, true, true], 'vertical'), 2);
  assert.equal(tabListTarget('ArrowRight', 0, [true, true, true], 'vertical'), null);
});

test('Tab stays inside an open overlay', () => {
  assert.equal(trapTarget(2, 3, false), 0, 'Tab on the last control wraps to the first');
  assert.equal(trapTarget(0, 3, true), 2, 'Shift+Tab on the first wraps to the last');
  assert.equal(trapTarget(1, 3, false), null, 'in the middle the browser moves focus');
  assert.equal(trapTarget(1, 3, true), null);
  assert.equal(trapTarget(-1, 3, false), 0, 'focus that escaped comes back in');
  assert.equal(trapTarget(-1, 3, true), 2);
  assert.equal(trapTarget(0, 1, false), 0, 'a single control keeps focus');
  assert.equal(trapTarget(0, 0, false), null);
});

test('overlays open on their preferred control, else the first', () => {
  assert.equal(initialFocus([false, false, true, false]), 2);
  assert.equal(initialFocus([false, false]), 0);
  assert.equal(initialFocus([]), -1);
});

test('keyboard GPS lists downtown places nearest first, without you', () => {
  const markers = [
    { id: 'bus', label: 'Bus stop', x: 100, z: 0, kind: 'bus' },
    { id: 'you', label: 'You', x: 0, z: 0, kind: 'you' },
    { id: 'pitch', label: 'Football pitch', x: 10, z: 10, kind: 'pitch' },
    { id: 'work', label: 'Fire station', x: -50, z: 0, kind: 'work' },
    { id: 'bad', label: 'Nowhere', x: Number.NaN, z: 0, kind: 'work' },
  ];
  assert.deepEqual(gpsDestinations(markers, { x: 0, z: 0 }).map(m => m.id), ['pitch', 'work', 'bus']);
  assert.deepEqual(gpsDestinations(markers, null).map(m => m.id), ['bus', 'pitch', 'work'], 'map order without a position');
  assert.deepEqual(gpsDestinations([], { x: 0, z: 0 }), []);
});

test('story scenes caption who is speaking, and texts as texts', async () => {
  const { CAST, CHAPTERS } = await import('../src/world/storyChapters.mjs');
  const { storyLineCaption, storyLineCue, chapterCaption } = await import('../src/world/soundCaptions.mjs');
  assert.equal(storyLineCaption(CAST.mom), 'Phone buzzes: text from Mom');
  assert.equal(storyLineCue(CAST.mom), 'message');
  assert.equal(storyLineCaption(CAST.elena), 'Phone buzzes: text from Elena');
  assert.equal(storyLineCue(CAST.elena), 'message');
  assert.equal(storyLineCaption(CAST.maya), 'Maya speaks');
  assert.equal(storyLineCue(CAST.maya), 'talk');
  assert.equal(storyLineCaption(CAST.rivera), 'Ms. Rivera speaks');
  assert.equal(storyLineCaption(CAST.you), 'You speak');
  assert.equal(storyLineCaption(CAST.narrator), 'Story chime');
  assert.equal(storyLineCaption(CAST.stranger), 'An unknown voice speaks');
  assert.equal(storyLineCaption(undefined), null);
  // Every speaker in every scene gets a caption.
  for (const chapter of CHAPTERS) for (const step of chapter.steps) {
    const scenes = !step.scene ? [] : Array.isArray(step.scene) ? [step.scene] : Object.values(step.scene);
    for (const scene of scenes) for (const line of scene) assert.ok(storyLineCaption(CAST[line.speaker]), line.speaker);
  }
  assert.equal(chapterCaption('Chapter 2 · The Note'), 'Fanfare: chapter complete (The Note)');
  assert.equal(chapterCaption('Chapter 5 · The Last Decision Day', true), 'Fanfare: the story ends (The Last Decision Day)');
});

test('a caption override replaces the generic text and still counts repeats', () => {
  let list = pushCaption([], 'talk', 0, 'Maya speaks');
  assert.equal(list[0].text, 'Maya speaks');
  list = pushCaption(list, 'talk', 1, 'Maya speaks');
  assert.equal(captionLabel(list.at(-1)), '[Maya speaks] ×2');
  list = pushCaption(list, 'talk', 1.5);
  assert.deepEqual(list.map(c => c.text), ['Maya speaks', 'Someone speaks']);
});
