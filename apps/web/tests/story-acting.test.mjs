import test from 'node:test';
import assert from 'node:assert/strict';
import { STORY_GESTURES, lineActing } from '../src/world/storyActing.mjs';
import { CHAPTERS, STORY_BEATS } from '../src/world/storyChapters.mjs';
import { readFile } from 'node:fs/promises';

const allLines = () => CHAPTERS.flatMap(chapter => chapter.steps.flatMap(step =>
  step.scene === null ? [] : Array.isArray(step.scene) ? [step.scene] : Object.values(step.scene)));

test('every gesture a story line can start is a clip the characters have', async () => {
  const build = await readFile(new URL('../../../scripts/build-actions.py', import.meta.url), 'utf8');
  for (const gesture of STORY_GESTURES) assert.match(build, new RegExp(`"${gesture}": \\(`), gesture);
});

test('beats are known, and each staged moment is in the story where it belongs', () => {
  const beats = allLines().flat().filter(line => line.beat);
  for (const line of beats) assert.ok(STORY_BEATS.includes(line.beat), line.beat);
  const has = (beat, words) => beats.some(line => line.beat === beat && words.test(line.text));
  assert.ok(has('note', /under your front door/));
  assert.ok(has('photo', /faded photo/));
  assert.ok(has('reveal', /Ms\. Rivera\?/));
  // All three endings get their celebration when the street changes.
  assert.equal(beats.filter(line => line.beat === 'celebrate').length, 3);
});

test('you talk on your lines and stop when someone else speaks', () => {
  assert.equal(lineActing({ speaker: 'you', text: 'No pressure, then.' }).gesture, 'Talk');
  assert.equal(lineActing({ speaker: 'maya', text: 'Hey.' }).gesture, null);
  assert.equal(lineActing({ speaker: 'narrator', text: 'The bell rings.' }).gesture, null);
});

test('staged beats: pick up the note, reach for the photo (once over two lines), dance when the street changes', () => {
  const note = { speaker: 'narrator', text: 'A folded note…', beat: 'note' };
  assert.deepEqual(lineActing(note, { mood: 'opening' }), { gesture: 'PickUp', emotion: 'fear', npcMood: 'neutral' });
  const photo = { speaker: 'narrator', text: 'A faded photo.', beat: 'photo' };
  const under = { speaker: 'narrator', text: 'Under it, a name.', beat: 'photo' };
  assert.equal(lineActing(photo).gesture, 'Interact');
  assert.equal(lineActing(under, { previous: photo }).gesture, 'hold', 'the reach is not restarted');
  const reveal = { speaker: 'you', text: 'A. Rivera. Ms. Rivera?', beat: 'reveal' };
  assert.deepEqual(lineActing(reveal), { gesture: 'Talk', emotion: 'fear', npcMood: 'neutral' });
  const party = { speaker: 'narrator', text: 'Last Decision Day.', beat: 'celebrate' };
  assert.deepEqual(lineActing(party, { mood: 'ending' }), { gesture: 'Dance', emotion: 'happy', npcMood: 'happy' });
});

test('faces and moods: uneasy at the unsigned note, happy in the endings and at exclamations', () => {
  assert.equal(lineActing({ speaker: 'stranger', text: '"Choose carefully. — A."' }).emotion, 'fear');
  assert.equal(lineActing({ speaker: 'okafor', text: 'A garden!' }, { mood: 'ending' }).emotion, 'happy');
  assert.equal(lineActing({ speaker: 'jordan', text: "Don't be late." }).npcMood, 'neutral');
  assert.equal(lineActing({ speaker: 'maya', text: 'Maple Street FC!' }).npcMood, 'happy');
  assert.equal(lineActing({ speaker: 'maya', text: 'Hi.' }).emotion, null, 'ordinary lines keep your usual face');
});

test('at the wheel, your hands stay on it', () => {
  for (const line of [{ speaker: 'you', text: 'Hi.' }, { speaker: 'narrator', text: 'x', beat: 'note' }, { speaker: 'narrator', text: 'x', beat: 'celebrate' }]) {
    assert.equal(lineActing(line, { driving: true }).gesture, null);
  }
  assert.equal(lineActing({ speaker: 'narrator', text: 'x', beat: 'celebrate' }, { driving: true, mood: 'ending' }).emotion, 'happy');
});

test('every line of the story gets a valid acting plan', () => {
  for (const lines of allLines()) lines.forEach((line, index) => {
    const acting = lineActing(line, { previous: lines[index - 1] ?? null });
    assert.ok(acting.gesture === null || acting.gesture === 'hold' || STORY_GESTURES.includes(acting.gesture));
    assert.ok(['neutral', 'happy'].includes(acting.npcMood));
  });
});
