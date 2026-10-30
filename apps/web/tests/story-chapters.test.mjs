import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAST, CHAPTERS, NEW_STORY, STORY_EVENTS, advanceStory, currentStep, markSceneSeen, normalizeStory, pendingScene, readStory, writeStory,
} from '../src/world/storyChapters.mjs';

test('every step has an objective, completes on real world events, and every line has a known speaker', () => {
  for (const chapter of CHAPTERS) {
    assert.ok(chapter.title && chapter.steps.length > 0);
    for (const step of chapter.steps) {
      assert.ok(step.objective.length > 5, `${step.id} objective`);
      for (const event of step.completeOn) assert.ok(STORY_EVENTS.includes(event), `${step.id}: ${event}`);
      for (const line of step.scene ?? []) {
        assert.ok(line.speaker in CAST, `${step.id}: ${line.speaker}`);
        assert.ok(line.text.length > 0 && line.text.length < 200, 'lines fit the dialogue box');
      }
    }
  }
  const ids = CHAPTERS.flatMap(chapter => chapter.steps.map(step => `${chapter.id}/${step.id}`));
  assert.equal(new Set(ids).size, ids.length);
});

test('chapter one plays from arrival to the note in order, one scene per step', () => {
  let state = { ...NEW_STORY };
  const order = ['reached-school', 'entered-school', 'attended-class', 'talked-teacher', 'entered-home', 'ate', 'slept'];
  const objectives = [];
  for (const event of order) {
    assert.ok(pendingScene(state), `a scene opens step ${currentStep(state).step.id}`);
    state = markSceneSeen(state);
    assert.equal(pendingScene(state), null, 'and plays once');
    objectives.push(currentStep(state).step.objective);
    // Out-of-order events do nothing.
    const ignored = advanceStory(state, 'drove');
    assert.deepEqual(ignored.state, state);
    assert.equal(ignored.completed, null);
    const result = advanceStory(state, event);
    assert.ok(result.completed, `${event} completes the step`);
    state = result.state;
    if (event === 'slept') assert.equal(result.chapterDone?.id, 'new-in-town');
  }
  assert.equal(objectives.length, 7);
  assert.deepEqual(state, { chapter: 1, step: 0, seen: false }, 'chapter two begins');
  assert.equal(currentStep(state).chapter.id, 'the-note');
});

test('the last chapter waits for new content instead of wrapping around', () => {
  const last = { chapter: CHAPTERS.length - 1, step: CHAPTERS.at(-1).steps.length - 1, seen: true };
  for (const event of STORY_EVENTS) assert.deepEqual(advanceStory(last, event).state, last);
});

test('story progress is saved per character and survives bad data', () => {
  const store = new Map();
  const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  assert.deepEqual(readStory('a', storage), { ...NEW_STORY });
  writeStory('a', { chapter: 0, step: 3, seen: true }, storage);
  assert.deepEqual(readStory('a', storage), { chapter: 0, step: 3, seen: true });
  assert.deepEqual(readStory('b', storage), { ...NEW_STORY });
  assert.deepEqual(normalizeStory({ chapter: 99, step: -4, seen: 'yes' }), { chapter: 0, step: 0, seen: false });
  store.set('tld-story-v1:a', '{broken');
  assert.deepEqual(readStory('a', storage), { ...NEW_STORY });
});

test('dinner is optional: going straight to bed skips it and still completes the chapter', () => {
  let state = { chapter: 0, step: CHAPTERS[0].steps.findIndex(step => step.id === 'dinner'), seen: true };
  const result = advanceStory(state, 'slept');
  assert.equal(result.completed?.id, 'sleep');
  assert.equal(result.chapterDone?.id, 'new-in-town');
  assert.deepEqual(result.state, { chapter: 1, step: 0, seen: false });
});
